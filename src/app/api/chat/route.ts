import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { chatCompletion, LlmError, type LlmMessage } from "@/lib/llm";
import { calcCost, type TokenUsage } from "@/lib/pricing";
import { getLiveRates } from "@/lib/pricing-live";
import {
  TASK_CREDITS,
  type AgentStep,
  type Artifact,
  type Chat,
  type ApiKeyRow,
  type ChatStreamEvent,
  type TaskKind,
} from "@/lib/types";
import { AGENT_TOOLS, webSearch, fetchUrl, createPdfReport } from "@/lib/tools";

export const maxDuration = 300;
export const runtime = "nodejs";

const MAX_ITERATIONS = 12;
const DELTA_CHUNK = 400;
const THINKING_MAX = 600;

function systemPrompt(): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `You are MicroManus, a rigorous deep-research agent. Today is ${today}.

First decide what the message needs: (1) casual conversation, greetings, opinions, or questions you can answer confidently from knowledge → answer DIRECTLY and conversationally, NO tools, keep it brief; (2) questions about current events, facts to verify, comparisons, or anything time-sensitive → research with tools; (3) explicit report/document requests → research then create_pdf_report. Never search for messages like 'hi', 'thanks', 'how are you'.

Operating principles:
- Plan before acting. Briefly decide what you need to find out, then act.
- Use web_search with MULTIPLE targeted queries to gather facts, and fetch_url to open and verify the most promising sources. Cross-check important claims across several independent sources.
- Think step by step. Prefer primary and authoritative sources; note when sources disagree.
- Cite sources inline as markdown links, e.g. [source](https://example.com), throughout your answer — in the CHAT RESPONSE itself, not only inside any PDF. End every researched answer with a "## Sources" section listing the key websites you used as markdown links. This is required even when you also produce a PDF; the chat answer must stand on its own with its citations visible.
- Be honest about uncertainty and gaps; never fabricate facts, numbers, or citations.
- When the user asks for a report, document, or deliverable — or when the research clearly warrants one — call create_pdf_report with well-structured markdown: a title, clear sections, findings, recommendations, and a Sources list with links. Still include the inline citations and Sources section in your chat reply as above.
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

      let runId: string | undefined;

      // Fire-and-forget-safe run row updater (sequential awaits are fine).
      const persistRun = async (patch: Record<string, unknown>) => {
        if (!runId) return;
        try {
          await supabase
            .from("agent_runs")
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq("id", runId);
        } catch {
          // best-effort persistence
        }
      };
      const isStopped = async (): Promise<boolean> => {
        if (!runId) return false;
        const { data } = await supabase
          .from("agent_runs")
          .select("status")
          .eq("id", runId)
          .single<{ status: string }>();
        return data?.status === "stopped";
      };

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

        // ---- Credits: hard gate. 0 credits -> must refill before any run. ----
        // (Charging itself is post-hoc + tiered: chat 0, research 1, report 2.)
        const { data: profile } = await supabase
          .from("profiles")
          .select("credits")
          .eq("id", userId)
          .single<{ credits: number }>();
        if ((profile?.credits ?? 0) <= 0) return fail("OUT_OF_CREDITS");

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

        const history: LlmMessage[] = [
          { role: "system", content: systemPrompt() },
        ];
        for (const row of priorRows ?? []) {
          if (row.content == null) continue;
          history.push({ role: row.role as "user" | "assistant", content: row.content });
        }
        // The just-inserted user message is already included via priorRows.

        // ---- Create the run row (replace any prior run for this chat) ----
        await supabase.from("agent_runs").delete().eq("chat_id", chatId).eq("user_id", userId);
        const { data: runRow } = await supabase
          .from("agent_runs")
          .insert({
            chat_id: chatId,
            user_id: userId,
            status: "running",
            task_kind: "chat",
            steps: [],
          })
          .select("id")
          .single<{ id: string }>();
        runId = runRow?.id;

        // ---- Agent loop ----
        const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
        const steps: AgentStep[] = [];
        const artifacts: Artifact[] = [];
        let finalText = "";
        let partialText = "";
        let latestThinking = "";
        let kind: TaskKind = "chat";
        let stopped = false;

        // Task kind starts as "chat" and is upgraded behaviorally.
        send({ type: "task", kind: "chat" });

        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          if (await isStopped()) {
            stopped = true;
            break;
          }

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

          if (result.content) partialText = result.content;

          // ---- Thinking snippet ----
          if (result.thinking && result.thinking.trim()) {
            const text = result.thinking.slice(0, THINKING_MAX);
            latestThinking = text;
            send({ type: "thinking", text });
            steps.push({
              type: "thinking",
              summary: result.thinking.slice(0, 80) + "…",
              detail: text,
            });
            await persistRun({ steps, thinking: latestThinking, task_kind: kind });
          }

          if (result.toolCalls.length > 0) {
            // Record the assistant turn that requested tools (preserve provider
            // blocks on Anthropic so replayed thinking blocks stay intact).
            history.push({
              role: "assistant",
              content: result.content ?? null,
              tool_calls: result.toolCalls,
              providerBlocks:
                key.provider === "anthropic"
                  ? (result.rawContent as unknown[] | undefined)
                  : undefined,
            });

            for (const call of result.toolCalls) {
              if (await isStopped()) {
                stopped = true;
                break;
              }

              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(call.arguments || "{}");
              } catch {
                args = {};
              }

              const callStep: AgentStep = {
                type: "tool_call",
                tool: call.name,
                summary: toolCallSummary(call.name, args),
              };
              steps.push(callStep);
              send({ type: "step", step: callStep });

              let resultContent = "";
              let resultSummary = "";
              try {
                if (call.name === "web_search") {
                  resultContent = await webSearch(String(args.query ?? ""));
                  resultSummary = describeSearch(resultContent);
                  if (kind === "chat") {
                    kind = "research";
                    send({ type: "task", kind: "research" });
                  }
                } else if (call.name === "fetch_url") {
                  resultContent = await fetchUrl(String(args.url ?? ""));
                  resultSummary = `${resultContent.length.toLocaleString()} chars`;
                  if (kind === "chat") {
                    kind = "research";
                    send({ type: "task", kind: "research" });
                  }
                } else if (call.name === "create_pdf_report") {
                  const artifact = await createPdfReport(
                    String(args.title ?? "Report"),
                    String(args.markdown ?? ""),
                    userId
                  );
                  artifacts.push(artifact);
                  resultContent = JSON.stringify({
                    type: artifact.type,
                    name: artifact.name,
                    url: artifact.url,
                    path: artifact.path,
                  });
                  resultSummary = `${artifact.name} created`;
                  send({ type: "artifact", artifact });
                  if (kind !== "report") {
                    kind = "report";
                    send({ type: "task", kind: "report" });
                  }
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

              await persistRun({ steps, thinking: latestThinking, task_kind: kind });
            }

            if (stopped) break;
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

        // ---- Resolve final text ----
        if (stopped) {
          finalText = partialText
            ? `${partialText}\n\n_[stopped by user]_`
            : "Stopped.";
          send({ type: "delta", text: finalText });
        } else if (!finalText) {
          finalText =
            "I reached the maximum number of research steps without producing a final answer. Please try narrowing the question.";
          send({ type: "delta", text: finalText });
        }

        // ---- Persist assistant message ----
        // Live rates (daily-cached; falls back to the static table on failure).
        const rates = await getLiveRates(chat.model);
        let cost = calcCost(chat.model, usage, rates);
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

        // ---- Charge post-hoc based on what the run actually did ----
        const creditsUsed = TASK_CREDITS[kind];
        // Fallback: if the charge fails, report the true balance rather than 0.
        let creditsRemaining = Math.max((profile?.credits ?? 0) - creditsUsed, 0);
        try {
          const { data: remaining, error: chargeErr } = await supabase.rpc("consume_credits", {
            p_amount: creditsUsed,
            p_reason: `agent_run:${kind}`,
          });
          if (!chargeErr && typeof remaining === "number" && remaining !== -1) {
            creditsRemaining = remaining;
          } else if (chargeErr) {
            console.error("consume_credits failed:", chargeErr.message);
          }
        } catch {
          // keep fallback value
        }

        send({
          type: "usage",
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedTokens: usage.cachedTokens,
          cost,
          creditsUsed,
          creditsRemaining,
        });

        if (stopped) {
          await persistRun({
            status: "stopped",
            content: finalText,
            steps,
            thinking: latestThinking,
            task_kind: kind,
          });
          send({ type: "stopped", messageId: saved?.id });
        } else {
          await persistRun({
            status: "done",
            content: finalText,
            steps,
            thinking: latestThinking,
            task_kind: kind,
          });
          send({ type: "done", messageId: saved?.id });
        }
        controller.close();
      } catch (err) {
        const msg =
          err instanceof LlmError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unexpected error";
        await persistRun({ status: "error", error: msg });
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
