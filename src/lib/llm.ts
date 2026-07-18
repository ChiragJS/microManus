// Unified LLM client with prompt caching + normalized usage.
//
// - OpenAI / Kimi / custom endpoints: OpenAI-compatible POST {baseUrl}/chat/completions.
//   Caching is automatic on both; cached tokens read from usage.prompt_tokens_details.cached_tokens.
// - Anthropic: native Messages API (POST /v1/messages) with explicit cache_control
//   breakpoints, because the Anthropic OpenAI-compat shim neither caches nor reports
//   cached tokens. Usage is normalized to the same shape.

import type { Provider, TokenUsage } from "./pricing";

export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LlmToolCall {
  id: string;
  name: string;
  /** JSON-encoded arguments */
  arguments: string;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
  /**
   * Opaque provider content blocks to replay verbatim. Used on the Anthropic
   * path so that thinking blocks preceding a tool_use turn are preserved when
   * the turn is replayed (required once thinking is enabled).
   */
  providerBlocks?: unknown[];
}

export interface LlmResult {
  content: string | null;
  toolCalls: LlmToolCall[];
  usage: TokenUsage;
  stopReason: "stop" | "tool_calls" | "length" | "other";
  /** Summarized reasoning/thinking text, if the model returned any (empty → undefined). */
  thinking?: string;
  /** Verbatim provider content blocks (Anthropic only) — the raw `data.content` array. */
  rawContent?: unknown;
}

export interface LlmRequest {
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens?: number;
}

export async function chatCompletion(req: LlmRequest): Promise<LlmResult> {
  if (req.provider === "anthropic") return anthropicCompletion(req);
  return openaiCompletion(req);
}

// ---------------- OpenAI-compatible ----------------

async function openaiCompletion(req: LlmRequest): Promise<LlmResult> {
  const base = req.baseUrl.replace(/\/+$/, "");
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map((m) => {
      if (m.role === "assistant" && m.tool_calls?.length) {
        return {
          role: "assistant",
          content: m.content ?? null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
      }
      if (m.role === "tool") {
        return { role: "tool", content: m.content ?? "", tool_call_id: m.tool_call_id };
      }
      return { role: m.role, content: m.content ?? "" };
    }),
  };
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  if (req.maxTokens) body.max_completion_tokens = req.maxTokens;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LlmError(res.status, extractError(text) || `LLM request failed (${res.status})`);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  const msg = choice?.message ?? {};
  const usage = data.usage ?? {};
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const toolCalls: LlmToolCall[] = (msg.tool_calls ?? []).map(
    (tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })
  );
  // Kimi/DeepSeek-style reasoning traces. Never replayed back to the model.
  const reasoning =
    typeof msg.reasoning_content === "string"
      ? msg.reasoning_content
      : typeof msg.reasoning === "string"
        ? msg.reasoning
        : "";
  return {
    content: msg.content ?? null,
    toolCalls,
    thinking: reasoning.length ? reasoning : undefined,
    usage: {
      inputTokens: Math.max(0, (usage.prompt_tokens ?? 0) - cached),
      outputTokens: usage.completion_tokens ?? 0,
      cachedTokens: cached,
    },
    stopReason:
      choice?.finish_reason === "tool_calls" || toolCalls.length > 0
        ? "tool_calls"
        : choice?.finish_reason === "length"
          ? "length"
          : choice?.finish_reason === "stop"
            ? "stop"
            : "other",
  };
}

// ---------------- Anthropic native (with prompt caching) ----------------

type AnthropicBlock = Record<string, unknown>;

async function anthropicCompletion(req: LlmRequest): Promise<LlmResult> {
  const base = req.baseUrl.replace(/\/+$/, "") || "https://api.anthropic.com/v1";
  const system: AnthropicBlock[] = [];
  const messages: { role: "user" | "assistant"; content: AnthropicBlock[] }[] = [];

  for (const m of req.messages) {
    if (m.role === "system") {
      system.push({ type: "text", text: m.content ?? "" });
      continue;
    }
    if (m.role === "assistant") {
      // Replay verbatim provider blocks when available (preserves thinking
      // blocks + signatures that Anthropic requires alongside tool_use).
      if (Array.isArray(m.providerBlocks) && m.providerBlocks.length) {
        messages.push({ role: "assistant", content: m.providerBlocks as AnthropicBlock[] });
        continue;
      }
      const blocks: AnthropicBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls ?? []) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: safeParse(tc.arguments),
        });
      }
      if (blocks.length) messages.push({ role: "assistant", content: blocks });
      continue;
    }
    if (m.role === "tool") {
      const block: AnthropicBlock = {
        type: "tool_result",
        tool_use_id: m.tool_call_id,
        content: m.content ?? "",
      };
      const last = messages[messages.length - 1];
      // Merge consecutive tool results into one user turn (required for parallel calls)
      if (last && last.role === "user" && last.content.every((b) => b.type === "tool_result")) {
        last.content.push(block);
      } else {
        messages.push({ role: "user", content: [block] });
      }
      continue;
    }
    messages.push({ role: "user", content: [{ type: "text", text: m.content ?? "" }] });
  }

  // Prompt caching: breakpoint on system prompt and on the last content block
  // so each agent-loop iteration reads the previous iteration's cache.
  if (system.length) system[system.length - 1].cache_control = { type: "ephemeral" };
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.content.length) {
    // Don't put the cache breakpoint on a thinking block — walk back to the
    // last non-thinking block (or skip entirely if there isn't one).
    let bp = lastMsg.content.length - 1;
    while (bp >= 0 && lastMsg.content[bp].type === "thinking") bp--;
    if (bp >= 0) lastMsg.content[bp].cache_control = { type: "ephemeral" };
  }

  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens ?? 8192,
    // Adaptive thinking with summarized display — surfaces reasoning snippets.
    thinking: { type: "adaptive", display: "summarized" },
    messages,
  };
  if (system.length) body.system = system;
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const res = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": req.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LlmError(res.status, extractError(text) || `LLM request failed (${res.status})`);
  }
  const data = await res.json();

  let content: string | null = null;
  let thinking = "";
  const toolCalls: LlmToolCall[] = [];
  for (const block of data.content ?? []) {
    if (block.type === "text") content = (content ?? "") + block.text;
    if (block.type === "thinking") thinking += block.thinking ?? "";
    if (block.type === "tool_use") {
      toolCalls.push({ id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) });
    }
  }
  const u = data.usage ?? {};
  return {
    content,
    toolCalls,
    thinking: thinking.length ? thinking : undefined,
    // Verbatim blocks so the caller can replay this turn with thinking intact.
    rawContent: data.content,
    usage: {
      // cache writes billed ≈ input rate (slight premium ignored for simplicity)
      inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
      cachedTokens: u.cache_read_input_tokens ?? 0,
    },
    stopReason:
      data.stop_reason === "tool_use"
        ? "tool_calls"
        : data.stop_reason === "end_turn"
          ? "stop"
          : data.stop_reason === "max_tokens"
            ? "length"
            : "other",
  };
}

// ---------------- helpers ----------------

export class LlmError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

function extractError(text: string): string | null {
  try {
    const j = JSON.parse(text);
    return j.error?.message ?? j.message ?? null;
  } catch {
    return text?.slice(0, 300) || null;
  }
}
