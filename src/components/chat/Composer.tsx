"use client";

import { useRef, useEffect, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { getModel } from "@/lib/pricing";

export default function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  stopping,
  modelId,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  stopping: boolean;
  modelId: string;
  /** hard-disabled (e.g. out of credits) */
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!streaming && !disabled && value.trim()) onSend();
    }
  }

  const modelName = getModel(modelId)?.name ?? modelId;
  const canSend = !streaming && !disabled && value.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className="rounded-2xl border border-line bg-surface-2 p-2 transition-colors focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/20">
        <div className="flex items-end gap-2">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={
              disabled
                ? "Out of credits — top up to continue"
                : "Ask MicroManus to research anything…"
            }
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.95rem] text-ink placeholder:text-ink-dim focus:outline-none"
          />
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              disabled={stopping}
              aria-label="Stop"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm text-ink-dim transition-colors hover:border-err/60 hover:text-err disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Square size={14} className={stopping ? "" : "fill-current"} />
              {stopping ? "Stopping…" : "Stop"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 font-mono text-[0.68rem] text-ink-dim">
        {streaming ? (
          <span>{stopping ? "Stopping the run…" : "Researching — this can take a moment…"}</span>
        ) : (
          <>
            <span>Model: {modelName}</span>
            <span className="text-line">|</span>
            <span>chat free · research 1 credit · report 2 credits · 0 credits = refill required</span>
          </>
        )}
      </div>
    </div>
  );
}
