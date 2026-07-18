"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import { PROVIDERS, getModel } from "@/lib/pricing";
import type { ApiKeyRow } from "@/lib/types";

type SafeKey = Pick<
  ApiKeyRow,
  "id" | "provider" | "base_url" | "model" | "label" | "created_at"
>;

export default function KeyList({ keys }: { keys: SafeKey[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onDelete(id: string) {
    if (!window.confirm("Delete this API key? Chats using it will stop working."))
      return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to delete key");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setDeletingId(null);
    }
  }

  if (keys.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface px-5 py-10 text-center">
        <KeyRound size={16} className="mx-auto text-ink-dim" aria-hidden />
        <p className="mt-3 text-sm text-ink-dim">
          No API keys yet. Add one above to start chatting.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-err">{error}</p>}
      {keys.map((k) => {
        const modelName = getModel(k.model)?.name ?? k.model;
        const providerName = PROVIDERS[k.provider]?.name ?? k.provider;
        return (
          <div
            key={k.id}
            className="mm-fade-in flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium text-ink">
                  {providerName}
                </span>
                <span className="text-sm text-ink-dim">{modelName}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-dim">
                <span className="font-mono">
                  {k.label ?? "••••••••••••••••"}
                </span>
                <span className="font-mono opacity-70">{k.base_url}</span>
                <span>
                  added{" "}
                  {new Date(k.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
            <button
              onClick={() => onDelete(k.id)}
              disabled={deletingId === k.id}
              aria-label="Delete key"
              className="rounded-lg border border-line p-2 text-ink-dim transition-colors duration-150 hover:border-err hover:text-err disabled:opacity-50"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
