"use client";

import type { TaskKind } from "@/lib/types";

const LABEL: Record<TaskKind, string> = {
  chat: "chat",
  research: "research",
  report: "report",
};

const STYLE: Record<TaskKind, string> = {
  chat: "border border-line bg-transparent text-ink-dim",
  research: "border border-accent/50 bg-transparent text-accent",
  report: "border border-transparent bg-accent text-bg",
};

/** Small task-kind chip shown on the streaming header and in message meta. */
export default function TaskBadge({
  kind,
  className = "",
}: {
  kind: TaskKind;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[0.62rem] tracking-wide uppercase ${STYLE[kind]} ${className}`}
    >
      {LABEL[kind]}
    </span>
  );
}
