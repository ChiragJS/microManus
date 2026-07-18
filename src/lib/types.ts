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
  type: "thought" | "tool_call" | "tool_result";
  /** tool name for tool_call/tool_result */
  tool?: string;
  /** short human-readable summary, e.g. the search query */
  summary?: string;
  /** truncated detail payload */
  detail?: string;
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
  | { type: "delta"; text: string }
  | { type: "artifact"; artifact: Artifact }
  | { type: "usage"; inputTokens: number; outputTokens: number; cachedTokens: number; cost: number; creditsRemaining: number }
  | { type: "title"; title: string }
  | { type: "done"; messageId?: string }
  | { type: "error"; message: string };
