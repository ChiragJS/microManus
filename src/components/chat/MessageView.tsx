"use client";

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Download } from "lucide-react";
import type { Artifact } from "@/lib/types";
import { TASK_CREDITS } from "@/lib/types";
import AgentTrace from "./AgentTrace";
import TaskBadge from "./TaskBadge";
import ThinkingTicker from "./ThinkingTicker";
import DocumentCard from "./DocumentCard";
import {
  markdownComponents,
  extractSources,
  SourcesRow,
} from "./markdown";
import {
  type DisplayMessage,
  fmtNum,
  fmtCost,
  inferTaskKind,
  thinkingSnippets,
} from "./format";

function creditLabel(n: number): string {
  if (n <= 0) return "free";
  return `${n} credit${n === 1 ? "" : "s"}`;
}

function MessageView({
  message,
  animate = false,
  openArtifactPath,
  onOpenArtifact,
}: {
  message: DisplayMessage;
  /** true for bubbles appended after mount — plays a fade+rise on entry */
  animate?: boolean;
  openArtifactPath: string | null;
  onOpenArtifact: (a: Artifact) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className={`flex justify-end ${animate ? "mm-msg-in" : ""}`}>
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-surface-2 px-4 py-2.5 text-[0.95rem] leading-relaxed whitespace-pre-wrap text-ink">
          {message.content}
        </div>
      </div>
    );
  }

  const hasUsage =
    !message.streaming &&
    (message.inputTokens > 0 || message.outputTokens > 0 || message.cost > 0);
  const kind = inferTaskKind(message);
  const credits = message.creditsUsed ?? TASK_CREDITS[kind];
  const snippets = message.streaming ? thinkingSnippets(message) : [];
  const sources = extractSources(message.content);
  const pdfArtifact = message.artifacts[0];

  async function copyResponse() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div
      className={`group relative w-full ${animate ? "mm-msg-in" : ""} ${
        message.stopped ? "opacity-80" : ""
      }`}
    >
      {/* Hover toolbar */}
      {!message.streaming && message.content && (
        <div className="absolute -top-1 right-0 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={copyResponse}
            aria-label="Copy response"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface text-ink-dim transition-colors hover:border-accent/50 hover:text-accent"
          >
            {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
          </button>
          {pdfArtifact && (
            <a
              href={pdfArtifact.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download PDF"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface text-ink-dim transition-colors hover:border-accent/50 hover:text-accent"
            >
              <Download size={13} />
            </a>
          )}
        </div>
      )}

      {/* Streaming header: task badge */}
      {message.streaming && message.taskKind && (
        <div className="mb-2">
          <TaskBadge kind={message.taskKind} />
        </div>
      )}

      {message.streaming && snippets.length > 0 && <ThinkingTicker snippets={snippets} />}

      <AgentTrace steps={message.steps} live={message.streaming} />

      {message.content && (
        <div className="text-[0.95rem] text-ink">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      {message.streaming && !message.content && snippets.length === 0 && (
        <div className="flex items-center gap-1.5 py-1 text-sm text-ink-dim">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          <span>Thinking…</span>
        </div>
      )}

      {message.artifacts.map((a) => (
        <DocumentCard
          key={a.path}
          artifact={a}
          isOpen={openArtifactPath === a.path}
          onOpen={onOpenArtifact}
        />
      ))}

      {!message.streaming && sources.length > 0 && <SourcesRow sources={sources} />}

      {(hasUsage || message.stopped) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.7rem] text-ink-dim">
          <TaskBadge kind={kind} className="opacity-80" />
          {hasUsage && (
            <>
              <span>·</span>
              <span>{fmtNum(message.inputTokens)} in</span>
              <span>·</span>
              <span>{fmtNum(message.outputTokens)} out</span>
              <span>·</span>
              <span>{fmtNum(message.cachedTokens)} cached</span>
              <span>·</span>
              <span>{fmtCost(message.cost)}</span>
            </>
          )}
          <span>·</span>
          <span>{creditLabel(credits)}</span>
          {message.stopped && (
            <>
              <span>·</span>
              <span className="text-err">stopped</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Memoized: markdown parsing is expensive; only re-render when this
// message's props actually change (not on every keystroke/SSE tick).
export default memo(MessageView);
