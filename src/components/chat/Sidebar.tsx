"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  CreditCard,
  KeyRound,
  BarChart3,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getModel } from "@/lib/pricing";
import type { Chat, ApiKeyRow } from "@/lib/types";
import { relativeTime } from "./format";

function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3.5 w-3.5 rounded-[3px] bg-accent" />
      <span className="text-[0.95rem] font-semibold tracking-tight">
        <span className="text-ink-dim">Micro</span>
        <span className="text-ink">Manus</span>
      </span>
    </div>
  );
}

function keyLabel(key: ApiKeyRow): string {
  const model = getModel(key.model);
  const modelName = model?.name ?? key.model;
  const provider = model?.provider ?? key.provider;
  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
  return key.label ? `${key.label} · ${modelName}` : `${modelName} · ${providerName}`;
}

export default function Sidebar({
  chats,
  activeChatId,
  apiKeys,
  credits,
  creating,
  onCreateChat,
  onDeleteChat,
}: {
  chats: Chat[];
  activeChatId: string | null;
  apiKeys: ApiKeyRow[];
  credits: number;
  creating: boolean;
  onCreateChat: (apiKeyId: string) => void;
  onDeleteChat: (id: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const hasKeys = apiKeys.length > 0;

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function handleNewClick() {
    if (!hasKeys) return;
    if (apiKeys.length === 1) {
      onCreateChat(apiKeys[0].id);
      return;
    }
    setPickerOpen((v) => !v);
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-4 py-4">
        <Wordmark />
      </div>

      {/* New research */}
      <div className="relative px-3" ref={pickerRef}>
        {hasKeys ? (
          <button
            type="button"
            onClick={handleNewClick}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={16} />
            New research
            {apiKeys.length > 1 && <ChevronDown size={14} className="ml-auto" />}
          </button>
        ) : (
          <Link
            href="/settings/keys"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
          >
            <KeyRound size={16} />
            Add an API key
          </Link>
        )}

        {pickerOpen && apiKeys.length > 1 && (
          <div className="absolute left-3 right-3 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-surface-2 shadow-xl">
            {apiKeys.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  onCreateChat(k.id);
                }}
                className="block w-full truncate px-3 py-2 text-left text-xs text-ink transition-colors hover:bg-surface hover:text-accent"
              >
                {keyLabel(k)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Thread list */}
      <nav className="mt-3 flex-1 overflow-y-auto px-2">
        {chats.length === 0 ? (
          <p className="px-2 py-4 text-xs text-ink-dim">No research yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((chat) => {
              const active = chat.id === activeChatId;
              return (
                <li key={chat.id} className="group relative">
                  <Link
                    href={`/chat/${chat.id}`}
                    className={`block rounded-lg px-2.5 py-2 pr-8 transition-colors ${
                      active ? "bg-surface-2" : "hover:bg-surface-2/60"
                    }`}
                  >
                    <span className="block truncate text-sm text-ink">{chat.title}</span>
                    <span className="block font-mono text-[0.65rem] text-ink-dim">
                      {relativeTime(chat.updated_at)}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDeleteChat(chat.id)}
                    aria-label="Delete research"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-dim opacity-0 transition-all hover:bg-surface hover:text-err group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-line px-3 py-3">
        <Link
          href="/paywall"
          className="mb-2 flex items-center justify-between rounded-lg border border-line px-3 py-2 transition-colors hover:bg-surface-2"
        >
          <span className="flex items-center gap-2 text-xs text-ink-dim">
            <CreditCard size={14} />
            Credits
          </span>
          <span className="font-mono text-xs text-ink">{credits}</span>
        </Link>
        <div className="flex items-center justify-between px-1">
          <Link
            href="/usage"
            className="flex items-center gap-1.5 text-xs text-ink-dim transition-colors hover:text-ink"
          >
            <BarChart3 size={14} />
            Usage
          </Link>
          <Link
            href="/settings/keys"
            className="flex items-center gap-1.5 text-xs text-ink-dim transition-colors hover:text-ink"
          >
            <KeyRound size={14} />
            API Keys
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-1.5 text-xs text-ink-dim transition-colors hover:text-ink"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
