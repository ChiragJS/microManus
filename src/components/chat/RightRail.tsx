"use client";

import { memo, useState, useRef, useEffect } from "react";
import { FileText, Download, ChevronRight, Layers, Link2 } from "lucide-react";
import type { Artifact } from "@/lib/types";
import { type Source, SourceRow } from "./markdown";

/** Conversation-level Artifacts / Sources summary cards (wide screens only). */
function RightRail({
  artifacts,
  sources,
  onOpenArtifact,
}: {
  artifacts: Artifact[];
  sources: Source[];
  onOpenArtifact: (a: Artifact) => void;
}) {
  const [artOpen, setArtOpen] = useState(false);
  const [srcOpen, setSrcOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setArtOpen(false);
        setSrcOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (artifacts.length === 0 && sources.length === 0) return null;

  return (
    <div ref={wrapRef} className="sticky top-8 flex w-[240px] shrink-0 flex-col gap-3">
      {artifacts.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              artifacts.length === 1 ? onOpenArtifact(artifacts[0]) : setArtOpen((v) => !v)
            }
            className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/40"
          >
            <Layers size={15} className="shrink-0 text-accent" />
            <span className="flex-1 text-sm text-ink">Artifacts</span>
            <span className="font-mono text-xs text-ink-dim">{artifacts.length}</span>
            <ChevronRight size={14} className="text-ink-dim" />
          </button>
          {artOpen && (
            <div className="mm-pop-in absolute right-0 top-full z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-xl">
              {artifacts.map((a) => (
                <div
                  key={a.path}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setArtOpen(false);
                      onOpenArtifact(a);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <FileText size={14} className="shrink-0 text-accent" />
                    <span className="truncate font-mono text-[0.75rem] text-ink">
                      {a.title ?? a.name}
                    </span>
                  </button>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Download PDF"
                    className="shrink-0 text-ink-dim transition-colors hover:text-accent"
                  >
                    <Download size={14} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sources.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setSrcOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/40"
          >
            <Link2 size={15} className="shrink-0 text-accent" />
            <span className="flex-1 text-sm text-ink">Sources</span>
            <span className="font-mono text-xs text-ink-dim">{sources.length}</span>
            <ChevronRight size={14} className="text-ink-dim" />
          </button>
          {srcOpen && (
            <div className="mm-pop-in absolute right-0 top-full z-30 mt-1.5 max-h-96 w-[300px] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl">
              {sources.map((s) => (
                <SourceRow key={s.href} source={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(RightRail);
