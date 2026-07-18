"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Download } from "lucide-react";
import type { Artifact } from "@/lib/types";
import AgentTrace from "./AgentTrace";
import { type DisplayMessage, fmtNum, fmtCost } from "./format";

const markdownComponents: Components = {
  a: ({ ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline-offset-2 hover:underline"
    />
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code
          className={`${className ?? ""} block`}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-ink"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[0.82em] leading-relaxed">
      {children}
    </pre>
  ),
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2 text-xl font-semibold tracking-tight text-ink">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 text-lg font-semibold tracking-tight text-ink">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-1.5 text-base font-semibold tracking-tight text-ink">{children}</h3>
  ),
  p: ({ children }) => <p className="my-2.5 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2.5 ml-5 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2.5 ml-5 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-accent/50 pl-3 text-ink-dim italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-line" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-line bg-surface-2 px-3 py-1.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-line px-3 py-1.5 align-top">{children}</td>
  ),
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
};

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  return (
    <a
      href={artifact.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-accent/50 hover:bg-surface-2"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-accent">
        <FileText size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{artifact.name}</span>
        <span className="block text-xs text-ink-dim">PDF report</span>
      </span>
      <span className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-dim transition-colors group-hover:border-accent/50 group-hover:text-accent">
        <Download size={14} />
        Download PDF
      </span>
    </a>
  );
}

export default function MessageView({ message }: { message: DisplayMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-surface-2 px-4 py-2.5 text-[0.95rem] leading-relaxed text-ink whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const hasUsage =
    !message.streaming &&
    (message.inputTokens > 0 || message.outputTokens > 0 || message.cost > 0);

  return (
    <div className="w-full">
      <AgentTrace steps={message.steps} live={message.streaming} />

      {message.content && (
        <div className="text-[0.95rem] text-ink">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        </div>
      )}

      {message.streaming && !message.content && (
        <div className="flex items-center gap-1.5 py-1 text-sm text-ink-dim">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          <span>Thinking…</span>
        </div>
      )}

      {message.artifacts.map((a) => (
        <ArtifactCard key={a.path} artifact={a} />
      ))}

      {hasUsage && (
        <div className="mt-2.5 font-mono text-[0.7rem] text-ink-dim">
          {fmtNum(message.inputTokens)} in · {fmtNum(message.outputTokens)} out ·{" "}
          {fmtNum(message.cachedTokens)} cached · {fmtCost(message.cost)}
        </div>
      )}
    </div>
  );
}
