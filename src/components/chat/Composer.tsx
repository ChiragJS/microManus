"use client";

import { useRef, useEffect, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import { getModel } from "@/lib/pricing";

export default function Composer({
  value,
  onChange,
  onSend,
  disabled,
  modelId,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  modelId: string;
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
      if (!disabled && value.trim()) onSend();
    }
  }

  const modelName = getModel(modelId)?.name ?? modelId;
  const canSend = !disabled && value.trim().length > 0;

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
            placeholder="Ask MicroManus to research anything…"
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.95rem] text-ink placeholder:text-ink-dim focus:outline-none"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
      <p className="mt-2 text-center font-mono text-[0.68rem] text-ink-dim">
        {disabled ? "Researching — this can take a moment…" : `Model: ${modelName}`}
      </p>
    </div>
  );
}
