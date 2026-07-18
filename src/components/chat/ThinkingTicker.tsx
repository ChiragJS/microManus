"use client";

import { Sparkles } from "lucide-react";

/**
 * Ephemeral, Perplexity-style thinking ticker. Shows the latest reasoning
 * snippet (full opacity) with the previous one faded beneath it. Each new
 * snippet rises + fades in via the mm-ticker-in keyframe (keyed on text).
 */
export default function ThinkingTicker({ snippets }: { snippets: string[] }) {
  if (snippets.length === 0) return null;
  const current = snippets[snippets.length - 1];
  const previous = snippets.length > 1 ? snippets[snippets.length - 2] : null;

  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles size={13} className="animate-pulse text-accent" />
        <span className="mm-shimmer font-mono text-[0.7rem] tracking-wide">thinking</span>
      </div>
      <div className="relative overflow-hidden pl-[1.35rem]">
        {previous && (
          <p
            key={`prev-${previous}`}
            className="truncate text-xs leading-relaxed text-ink-dim opacity-40"
          >
            {previous}
          </p>
        )}
        <p
          key={`cur-${current}`}
          className="mm-ticker-in truncate text-[0.8rem] leading-relaxed text-ink"
        >
          {current}
        </p>
      </div>
    </div>
  );
}
