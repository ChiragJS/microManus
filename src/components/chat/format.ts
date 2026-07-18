import type { MessageRow, AgentStep, Artifact } from "@/lib/types";

/** Client-side representation of a rendered message. */
export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps: AgentStep[];
  artifacts: Artifact[];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  /** true while the assistant answer is still streaming */
  streaming?: boolean;
}

export function fromRow(row: MessageRow): DisplayMessage {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content ?? "",
    steps: Array.isArray(row.steps) ? row.steps : [],
    artifacts: Array.isArray(row.artifacts) ? row.artifacts : [],
    inputTokens: row.input_tokens ?? 0,
    outputTokens: row.output_tokens ?? 0,
    cachedTokens: row.cached_tokens ?? 0,
    cost: row.cost ?? 0,
  };
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function fmtCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
