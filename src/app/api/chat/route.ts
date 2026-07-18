import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { chatCompletion, LlmError, type LlmMessage } from "@/lib/llm";
import { calcCost, type TokenUsage } from "@/lib/pricing";
import type { AgentStep, Artifact, Chat, ApiKeyRow, ChatStreamEvent } from "@/lib/types";
import {
  AGENT_TOOLS,
  webSearch,
  fetchUrl,
  createPdfReport,
} from "@/lib/tools";

export const maxDuration = 300;
export const runtime = "nodejs";

const MAX_ITERATIONS = 12;
const DELTA_CHUNK = 400;

function systemPrompt(): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `You are MicroManus, a rigorous deep-research agent. Today is ${today}.

Operating principles:
- Plan before acting. Briefly decide what you need to find out, then act.
- Use web_search with MULTIPLE targeted queries to gather facts, and fetch_url to open and verify the most promising sources. Cross-check important claims across several independent sources.
- Think step by step. Prefer primary and authoritative sources; note when sources disagree.
- Cite sources inline as markdown links, e.g. [source](https://example.com), throughout your answer.
- Be honest about uncertainty and gaps; never fabricate facts, numbers, or citations.
- When the user asks for a report, document, or deliverable — or when the research clearly warrants one — call create_pdf_report with well-structured markdown: a title, clear sections, findings, recommendations, and a Sources list with links.
- Write clear, well-organized markdown answers. Lead with the conclusion, then supporting detail.`;
}

function sse(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { chatId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const chatId = body.chatId;
  const message = (body.message ?? "").trim();
  if (!chatId || !message) {
    return new Response(JSON.stringify({ error: "chatId and message are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(sse(event)));
      const fail = (msg: string) => {
        send({ type: "error", message: msg });
        send({ type: "done" });
        controller.close();
      };

      let creditConsumed = false;
      let runCompleted = false;

      try {
        // ---- Load chat + api key ----
        const { data: chat } = await supabase
          .from("chats")
          .select("*")
          .eq("id", chatId)
          .eq("user_id", userId)
          .single<Chat>();
        if (!chat) return fail("Chat not found");

        if (!chat.api_key_id) return fail("No API key attached");
        const { data: key } = await supabase
          .from("api_keys")
          .select("*")
          .eq("id", chat.api_key_id)
          .eq("user_id", userId)
          .single<ApiKeyRow>();
        if (!key) return fail("No API key attached");

        let apiKey: string;
        try {
          apiKey = decrypt(key.api_key_encrypted);
        } catch {
          return fail("Failed to decrypt API key");
        }

        // ---- Consume one credit ----
        const { data: remaining, error: creditErr } = await supabase.rpc("consume_credit");
        if (creditErr) return fail("Failed to consume credit");
        if (remaining === -1) return fail("OUT_OF_CREDITS");
        creditConsumed = true;
        const creditsRemaining = typeof remaining === "number" ? remaining : 0;

        // ---- Persist user message ----
        await supabase.from("messages").insert({
          chat_id: chatId,
          user_id: userId,
          role: "user",
          content: message,
        });

        // ---- Build history (user/assistant content only) ----
        const { data: priorRows } = await supabase
          .from("messages")
          .select("role, content, created_at")
          .eq("chat_id", chatId)
          .in("role", ["user", "assistant"])
          .order("created_at", { ascending: true });

        const history: LlmMessage[] = [{ role: "system", content: systemPrompt() }];
        for (const row of priorRows ?? []) {
          if (row.content == null) continue;
          history.push({ role: row.role as "user" | "assistant", content: row.content });
        }
        // The just-inserted user message is already included via priorRows.

        // ---- Agent loop ----
        const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
        const steps: AgentStep[] = [];
        const artifacts: Artifact[] = [];
        let finalText = "";

        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          const result = await chatCompletion({
            provider: key.provider,
            baseUrl: key.base_url,
            apiKey,
            model: chat.model,
            messages: history,
            tools: AGENT_TOOLS,
          });

          usage.inputTokens += result.usage.inputTokens;
          usage.outputTokens += result.usage.outputTokens;
          usage.cachedTokens += result.usage.cachedTokens;

          if (result.toolCalls.length > 0) {
            // Record the assistant turn that requested tools.
            history.push({
              role: "assistant",
              content: result.content ?? null,
              tool_calls: result.toolCalls,
            });

            for (const call of result.toolCalls) {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(call.arguments || "{}");
              } catch {
                args = {};
              }

              const callSummary = toolCallSummary(call.name, args);
              const callStep: AgentStep = {
                type: "tool_call",
                tool: call.name,
                summary: callSummary,
              };
              steps.push(callStep);
              send({ type: "step", step: callStep });

              let resultContent = "";
              let resultSummary = "";
              try {
                if (call.name === "web_search") {
                  resultContent = await webSearch(String(args.query ?? ""));
                  resultSummary = describeSearch(resultContent);
                } else if (call.name === "fetch_url") {
                  resultContent = await fetchUrl(String(args.url ?? ""));
                  resultSummary = `${resultContent.length.toLocaleString()} chars`;
                } else if (call.name === "create_pdf_report") {
                  const artifact = await createPdfReport(
                    String(args.title ?? "Report"),
                    String(args.markdown ?? ""),
                    userId
                  );
                  artifacts.push(artifact);
                  resultContent = JSON.stringify(artifact);
                  resultSummary = `${artifact.name} created`;
                  send({ type: "artifact", artifact });
                } else {
                  resultContent = `Error: unknown tool "${call.name}".`;
                  resultSummary = "unknown tool";
                }
              } catch (err) {
                resultContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
                resultSummary = "error";
              }

              const resultStep: AgentStep = {
                type: "tool_result",
                tool: call.name,
                summary: resultSummary,
              };
              steps.push(resultStep);
              send({ type: "step", step: resultStep });

              history.push({
                role: "tool",
                content: resultContent,
                tool_call_id: call.id,
              });
            }
            // Continue the loop so the model can observe tool results.
            continue;
          }

          // No tool calls → final answer.
          finalText = result.content ?? "";
          for (let i = 0; i < finalText.length; i += DELTA_CHUNK) {
            send({ type: "delta", text: finalText.slice(i, i + DELTA_CHUNK) });
          }
          break;
        }

        if (!finalText) {
          finalText =
            "I reached the maximum number of research steps without producing a final answer. Please try narrowing the question.";
          send({ type: "delta", text: finalText });
        }

        // ---- Persist assistant message ----
        const cost = calcCost(chat.model, usage);
        const { data: saved } = await supabase
          .from("messages")
          .insert({
            chat_id: chatId,
            user_id: userId,
            role: "assistant",
            content: finalText,
            steps: steps.length ? steps : null,
            artifacts: artifacts.length ? artifacts : null,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cached_tokens: usage.cachedTokens,
            cost,
          })
          .select("id")
          .single();
        runCompleted = true;

        // ---- Update chat: bump activity + maybe set title ----
        const patch: { updated_at: string; title?: string } = {
          updated_at: new Date().toISOString(),
        };
        if (chat.title === "New research") {
          const newTitle = message.slice(0, 60);
          patch.title = newTitle;
          send({ type: "title", title: newTitle });
        }
        await supabase.from("chats").update(patch).eq("id", chatId).eq("user_id", userId);

        send({
          type: "usage",
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedTokens: usage.cachedTokens,
          cost,
          creditsUsed: 1,
          creditsRemaining,
        });
        send({ type: "done", messageId: saved?.id });
        controller.close();
      } catch (err) {
        let msg =
          err instanceof LlmError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unexpected error";
        // The run failed before producing an answer — give the credit back.
        if (creditConsumed && !runCompleted) {
          try {
            await createAdminClient().rpc("refund_credit", { p_user_id: userId });
            msg += " — your credit was refunded.";
          } catch {
            // refund is best-effort
          }
        }
        try {
          send({ type: "error", message: msg });
          send({ type: "done" });
          controller.close();
        } catch {
          // stream already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function toolCallSummary(name: string, args: Record<string, unknown>): string {
  if (name === "web_search") return String(args.query ?? "");
  if (name === "fetch_url") return String(args.url ?? "");
  if (name === "create_pdf_report") return String(args.title ?? "Report");
  return name;
}

function describeSearch(json: string): string {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return `${parsed.length} result${parsed.length === 1 ? "" : "s"}`;
    if (parsed?.error) return "search failed";
    if (Array.isArray(parsed?.results)) return `${parsed.results.length} results`;
  } catch {
    // ignore
  }
  return "done";
}
