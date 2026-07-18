import type { MessageRow, AgentStep, Artifact, TaskKind, AgentRun } from "@/lib/types";

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
  /** task classification for this run — drives the badge + credit line */
  taskKind?: TaskKind | null;
  /** credits charged for this run (0 = free chat) */
  creditsUsed?: number | null;
  /** true while the assistant answer is still streaming */
  streaming?: boolean;
  /** the run was stopped by the user */
  stopped?: boolean;
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
    stopped: (row.content ?? "").includes("_[stopped by user]_"),
  };
}

/** Infer the task kind of a finished message from what the run actually did. */
export function inferTaskKind(m: DisplayMessage): TaskKind {
  if (m.taskKind) return m.taskKind;
  if (m.artifacts.length > 0) return "report";
  if (m.steps.some((s) => s.type === "tool_call" || s.type === "tool_result")) {
    return "research";
  }
  return "chat";
}

/** Latest thinking snippets on a message, newest last, for the ticker. */
export function thinkingSnippets(m: DisplayMessage): string[] {
  return m.steps
    .filter((s) => s.type === "thinking")
    .map((s) => (s.detail || s.summary || "").trim())
    .filter(Boolean);
}

/** Build a live assistant bubble from a persisted/background AgentRun. */
export function runToDisplayMessage(run: AgentRun): DisplayMessage {
  const steps = Array.isArray(run.steps) ? [...run.steps] : [];
  if (run.thinking && !steps.some((s) => s.type === "thinking")) {
    steps.push({ type: "thinking", summary: firstLine(run.thinking), detail: run.thinking });
  }
  return {
    id: `run-${run.id}`,
    role: "assistant",
    content: run.content ?? "",
    steps,
    artifacts: [],
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    cost: 0,
    taskKind: run.task_kind,
    streaming: run.status === "running",
    stopped: run.status === "stopped",
  };
}

export function firstLine(s: string, n = 90): string {
  const line = (s.split("\n").find((l) => l.trim()) ?? s).trim();
  return line.length > n ? `${line.slice(0, n - 1)}…` : line;
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
