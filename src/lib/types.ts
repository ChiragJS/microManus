import type { Provider } from "./pricing";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  credits: number;
  unlocked: boolean;
  unlock_method: "coupon" | "payment" | null;
  coupon_redeemed: boolean;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface ApiKeyRow {
  id: string;
  user_id: string;
  provider: Provider;
  base_url: string;
  api_key_encrypted: string;
  model: string;
  label: string | null;
  created_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  api_key_id: string | null;
  provider: Provider;
  model: string;
  /** 1-2 sentence rolling context summary shown in the side panel */
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface Artifact {
  type: "pdf";
  name: string;
  url: string;
  path: string;
}

/** One step of the agent trace, persisted on the assistant message. */
export interface AgentStep {
  type: "thought" | "thinking" | "tool_call" | "tool_result";
  /** tool name for tool_call/tool_result */
  tool?: string;
  /** short human-readable summary, e.g. the search query */
  summary?: string;
  /** truncated detail payload; for type="thinking" the (truncated) thinking text */
  detail?: string;
}

/** Task classification for a run — drives credit pricing and UI badge. */
export type TaskKind = "chat" | "research" | "report";

/** Credit price per task kind (charged post-hoc based on what the run actually did). */
export const TASK_CREDITS: Record<TaskKind, number> = {
  chat: 0, // no tools used — plain conversational answer
  research: 1, // used web_search / fetch_url
  report: 2, // produced a PDF artifact
};

/** Live run state persisted in agent_runs for background/resume UX. */
export interface AgentRun {
  id: string;
  chat_id: string;
  user_id: string;
  status: "running" | "done" | "error" | "stopped";
  task_kind: TaskKind | null;
  steps: AgentStep[] | null;
  /** latest thinking snippet for the ticker */
  thinking: string | null;
  /** partial or final answer text */
  content: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  chat_id: string;
  user_id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  tool_calls: unknown | null;
  tool_call_id: string | null;
  steps: AgentStep[] | null;
  artifacts: Artifact[] | null;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost: number;
  created_at: string;
}

/** SSE events streamed from /api/chat to the client. */
export type ChatStreamEvent =
  | { type: "step"; step: AgentStep }
  /** streamed thinking/reasoning snippet for the ephemeral ticker */
  | { type: "thinking"; text: string }
  /** emitted once the run's task kind is known/upgraded (chat -> research -> report) */
  | { type: "task"; kind: TaskKind }
  | { type: "delta"; text: string }
  | { type: "artifact"; artifact: Artifact }
  | { type: "summary"; summary: string }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      cost: number;
      creditsUsed: number;
      creditsRemaining: number;
    }
  | { type: "title"; title: string }
  /** run was stopped by the user; partial content persisted */
  | { type: "stopped"; messageId?: string }
  | { type: "done"; messageId?: string }
  | { type: "error"; message: string };
