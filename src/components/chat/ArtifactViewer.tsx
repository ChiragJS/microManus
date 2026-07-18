"use client";

import { useEffect, useRef, useState } from "react";
import { X, ChevronsRight, Download, FileText } from "lucide-react";
import type { Artifact } from "@/lib/types";
import { Markdown } from "./markdown";

/** Right-side Manus-style split-view panel that renders a report's markdown. */
export default function ArtifactViewer({
  artifact,
  onClose,
}: {
  artifact: Artifact;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Play the slide-out before the parent unmounts the panel.
  function requestClose() {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, 190);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <aside
      className={`flex h-full w-[45%] min-w-[360px] shrink-0 flex-col border-l border-line bg-bg ${
        closing ? "mm-panel-out" : "mm-panel-in"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close panel"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X size={16} />
        </button>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Collapse panel"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ChevronsRight size={16} />
        </button>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          <FileText size={14} className="shrink-0 text-accent" />
          <span className="truncate font-mono text-[0.8rem] text-ink">
            {artifact.title ?? artifact.name}
          </span>
        </span>
        <a
          href={artifact.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-dim transition-colors hover:border-accent/50 hover:text-accent"
        >
          <Download size={14} />
          Download PDF
        </a>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-8 text-[0.9rem] text-ink">
          {artifact.markdown ? (
            <Markdown>{artifact.markdown}</Markdown>
          ) : (
            <p className="text-sm text-ink-dim">
              No inline preview available for this report — download the PDF to view it.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
