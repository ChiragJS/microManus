"use client";

import { useState } from "react";
import {
  Search,
  Globe,
  FileText,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { AgentStep } from "@/lib/types";

function toolIcon(tool?: string) {
  if (tool === "web_search") return Search;
  if (tool === "fetch_url") return Globe;
  if (tool === "create_pdf_report") return FileText;
  return Search;
}

function verb(tool?: string): string {
  if (tool === "web_search") return "Searched";
  if (tool === "fetch_url") return "Read";
  if (tool === "create_pdf_report") return "Created";
  return "Ran";
}

function truncate(s: string, n = 72): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

/** Compact collapsible list of agent steps shown above an assistant answer. */
export default function AgentTrace({
  steps,
  live,
}: {
  steps: AgentStep[];
  live?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Only tool_call steps carry a headline; tool_result steps refine the last call.
  const calls = steps.filter((s) => s.type === "tool_call");
  if (calls.length === 0 && !live) return null;

  const lastIsUnresolved =
    live &&
    steps.length > 0 &&
    steps[steps.length - 1].type === "tool_call";

  const summaryLabel = live
    ? "Researching…"
    : `${calls.length} research step${calls.length === 1 ? "" : "s"}`;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group inline-flex items-center gap-1.5 text-xs text-ink-dim transition-colors hover:text-ink"
      >
        {live ? (
          <Loader2 size={13} className="animate-spin text-accent" />
        ) : (
          <ChevronRight
            size={13}
            className={`transition-transform ${open ? "rotate-90" : ""}`}
          />
        )}
        <span className="font-mono tracking-tight">{summaryLabel}</span>
      </button>

      {(open || live) && (
        <ol className="mt-2 space-y-1 border-l border-line pl-3">
          {steps.map((step, i) => {
            if (step.type !== "tool_call") return null;
            const Icon = toolIcon(step.tool);
            // Find the matching result (the next tool_result for this tool).
            const isLast = i === steps.length - 1;
            const inflight = live && isLast && lastIsUnresolved;
            return (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-ink-dim"
              >
                <Icon
                  size={13}
                  className={`mt-0.5 shrink-0 ${
                    inflight ? "text-accent" : "text-ink-dim"
                  }`}
                />
                <span className={inflight ? "animate-pulse text-ink" : ""}>
                  <span className="text-ink-dim">{verb(step.tool)}: </span>
                  {truncate(step.summary ?? "")}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
