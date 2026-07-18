"use client";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  memo,
} from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  CreditCard,
  KeyRound,
  BarChart3,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getModel } from "@/lib/pricing";
import type { Chat, ApiKeyRow } from "@/lib/types";
import { relativeTime } from "./format";

const WIDTH_KEY = "mm.sidebar.width";
const COLLAPSED_KEY = "mm.sidebar.collapsed";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const RAIL_WIDTH = 56;

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function LogoMark({ size = 20 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/microManusLogo.svg"
      alt="MicroManus"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-md"
    />
  );
}

function keyLabel(key: ApiKeyRow): string {
  const model = getModel(key.model);
  const modelName = model?.name ?? key.model;
  const provider = model?.provider ?? key.provider;
  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
  return key.label ? `${key.label} · ${modelName}` : `${modelName} · ${providerName}`;
}

function Sidebar({
  chats,
  activeChatId,
  apiKeys,
  credits,
  creating,
  onCreateChat,
  onDeleteChat,
  onSelectChat,
}: {
  chats: Chat[];
  activeChatId: string | null;
  apiKeys: ApiKeyRow[];
  credits: number;
  creating: boolean;
  onCreateChat: (apiKeyId: string) => void;
  onDeleteChat: (id: string) => void;
  onSelectChat: (id: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const hasKeys = apiKeys.length > 0;

  // Restore persisted width/collapsed before first paint (client only).
  useIsoLayoutEffect(() => {
    try {
      const w = Number(localStorage.getItem(WIDTH_KEY));
      if (w >= MIN_WIDTH && w <= MAX_WIDTH) setWidth(w);
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      /* SSR / storage unavailable */
    }
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    document.body.classList.add("mm-resizing");

    function onMove(ev: MouseEvent) {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX));
      setWidth(next);
    }
    function onUp() {
      setDragging(false);
      document.body.classList.remove("mm-resizing");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setWidth((w) => {
        try {
          localStorage.setItem(WIDTH_KEY, String(w));
        } catch {
          /* ignore */
        }
        return w;
      });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  function resetWidth() {
    setWidth(DEFAULT_WIDTH);
    try {
      localStorage.setItem(WIDTH_KEY, String(DEFAULT_WIDTH));
    } catch {
      /* ignore */
    }
  }

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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

  const asideWidth = collapsed ? RAIL_WIDTH : width;

  /* --------------------------- Collapsed rail --------------------------- */
  if (collapsed) {
    return (
      <aside
        style={{ width: asideWidth }}
        className="mm-anim-width relative flex h-full shrink-0 flex-col border-r border-line bg-surface"
      >
        <div className="flex h-full flex-col items-center gap-3 py-4">
          <LogoMark size={24} />
          <button
            type="button"
            onClick={handleNewClick}
            disabled={!hasKeys || creating}
            aria-label="New research"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={18} />
          </button>
          <Link
            href="/paywall"
            aria-label={`${credits} credits`}
            className="flex flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-ink-dim transition-colors hover:text-ink"
          >
            <CreditCard size={16} />
            <span className="font-mono text-[0.6rem] text-ink">{credits}</span>
          </Link>
          <div className="mt-auto">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  /* ---------------------------- Full sidebar ---------------------------- */
  return (
    <aside
      style={{ width: asideWidth }}
      className={`relative flex h-full shrink-0 flex-col border-r border-line bg-surface ${
        dragging ? "" : "mm-anim-width"
      }`}
    >
      {/* Resize handle */}
      <div
        onMouseDown={startDrag}
        onDoubleClick={resetWidth}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        className={`absolute right-0 top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:bg-accent/40 ${
          dragging ? "bg-accent/60" : "bg-transparent"
        }`}
      />

      <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <LogoMark size={20} />
          <span className="text-[0.95rem] font-semibold tracking-tight">
            <span className="text-ink-dim">Micro</span>
            <span className="text-ink">Manus</span>
          </span>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Collapse sidebar"
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <PanelLeftClose size={16} />
        </button>
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
          <div className="mm-pop-in absolute right-3 left-3 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-surface-2 shadow-xl">
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
                  <a
                    href={`/chat/${chat.id}`}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      onSelectChat(chat.id);
                    }}
                    className={`block rounded-lg px-2.5 py-2 pr-8 transition-colors ${
                      active ? "bg-surface-2" : "hover:bg-surface-2/60"
                    }`}
                  >
                    <span className="block truncate text-sm text-ink">{chat.title}</span>
                    <span className="block font-mono text-[0.65rem] text-ink-dim">
                      {relativeTime(chat.updated_at)}
                    </span>
                  </a>
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
      </div>
    </aside>
  );
}

// Memoized: typing in the composer must not re-render the thread list.
export default memo(Sidebar);
