"use client";

import { useState } from "react";
import { FileText, Copy, Check, Maximize2, Download } from "lucide-react";
import type { Artifact } from "@/lib/types";
import { Markdown } from "./markdown";

const iconBtn =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-ink-dim transition-colors hover:border-accent/50 hover:text-accent";

/**
 * Inline document-preview card for a report artifact. When markdown is present
 * it renders a rich preview that opens the viewer panel on click; otherwise it
 * falls back to a simple download chip (older messages without markdown).
 */
export default function DocumentCard({
  artifact,
  isOpen,
  onOpen,
}: {
  artifact: Artifact;
  isOpen: boolean;
  onOpen: (artifact: Artifact) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!artifact.markdown) {
    // Fallback: simple chip
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
          <span className="block truncate text-sm font-medium text-ink">
            {artifact.title ?? artifact.name}
          </span>
          <span className="block text-xs text-ink-dim">PDF report</span>
        </span>
        <span className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-dim transition-colors group-hover:border-accent/50 group-hover:text-accent">
          <Download size={14} />
          Download PDF
        </span>
      </a>
    );
  }

  const preview = artifact.markdown.split("\n").slice(0, 12).join("\n");

  async function copyMd(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(artifact.markdown ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(artifact)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(artifact);
        }
      }}
      className={`group mt-3 block w-full max-w-md cursor-pointer overflow-hidden rounded-xl border bg-surface text-left transition-colors ${
        isOpen ? "border-accent/60" : "border-line hover:border-accent/40"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-dim text-accent">
          <FileText size={15} />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[0.8rem] text-ink">
          {artifact.title ?? artifact.name}
        </span>
        <button type="button" onClick={copyMd} className={iconBtn} aria-label="Copy markdown">
          {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(artifact);
          }}
          className={iconBtn}
          aria-label="Open in panel"
        >
          <Maximize2 size={14} />
        </button>
        <a
          href={artifact.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={iconBtn}
          aria-label="Download PDF"
        >
          <Download size={14} />
        </a>
      </div>

      {/* Preview body */}
      <div className="relative">
        <div className="pointer-events-none max-h-44 overflow-hidden px-4 py-3 text-[0.72rem] leading-relaxed text-ink-dim [&_h1]:text-sm [&_h2]:text-[0.8rem] [&_h3]:text-[0.75rem] [&_p]:my-1.5">
          <Markdown>{preview}</Markdown>
        </div>
        {/* fade-out mask */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />
        {isOpen ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full border border-accent/50 bg-surface px-3 py-1 font-mono text-[0.65rem] tracking-wide text-accent uppercase shadow-lg">
              Currently open
            </span>
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <span className="max-w-[85%] truncate rounded-full border border-accent/50 bg-accent px-3 py-1 font-mono text-[0.65rem] tracking-wide text-bg shadow-lg">
              Open {artifact.title ?? artifact.name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
