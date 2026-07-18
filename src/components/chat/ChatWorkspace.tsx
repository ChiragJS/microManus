"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import type {
  Chat,
  ApiKeyRow,
  MessageRow,
  ChatStreamEvent,
  Artifact,
  AgentRun,
} from "@/lib/types";
import Sidebar from "./Sidebar";
import MessageView from "./MessageView";
import Composer from "./Composer";
import ArtifactViewer from "./ArtifactViewer";
import RightRail from "./RightRail";
import { extractSources, type Source } from "./markdown";
import {
  type DisplayMessage,
  fromRow,
  firstLine,
  runToDisplayMessage,
} from "./format";
import {
  type LiveRun,
  getLiveRun,
  setLiveRun,
  updateLiveRun,
  subscribeLiveRun,
} from "./liveStore";

const EXAMPLE_PROMPTS = [
  "Research and create a report of top schools in India for my kid",
  "Compare the top 3 vector databases in 2026",
  "What happened in AI this week?",
];

/* ------------------------------------------------------------------ */
/* SSE driving — runs detached from component lifecycle via liveStore  */
/* ------------------------------------------------------------------ */

function mutateAssistant(chatId: string, fn: (m: DisplayMessage) => DisplayMessage) {
  updateLiveRun(chatId, (r) => ({ ...r, assistant: fn(r.assistant) }));
}

function applyEvent(chatId: string, ev: ChatStreamEvent) {
  switch (ev.type) {
    case "task":
      mutateAssistant(chatId, (m) => ({ ...m, taskKind: ev.kind }));
      break;
    case "thinking":
      mutateAssistant(chatId, (m) => ({
        ...m,
        steps: [
          ...m.steps,
          { type: "thinking", summary: firstLine(ev.text), detail: ev.text },
        ],
      }));
      break;
    case "step":
      mutateAssistant(chatId, (m) => ({ ...m, steps: [...m.steps, ev.step] }));
      break;
    case "delta":
      mutateAssistant(chatId, (m) => ({ ...m, content: m.content + ev.text }));
      break;
    case "artifact":
      mutateAssistant(chatId, (m) => ({ ...m, artifacts: [...m.artifacts, ev.artifact] }));
      break;
    case "summary":
      updateLiveRun(chatId, (r) => ({ ...r, summaryUpdate: ev.summary }));
      break;
    case "usage":
      updateLiveRun(chatId, (r) => ({
        ...r,
        creditsRemaining: ev.creditsRemaining,
        assistant: {
          ...r.assistant,
          inputTokens: ev.inputTokens,
          outputTokens: ev.outputTokens,
          cachedTokens: ev.cachedTokens,
          cost: ev.cost,
          creditsUsed: ev.creditsUsed,
        },
      }));
      break;
    case "title":
      updateLiveRun(chatId, (r) => ({ ...r, titleUpdate: ev.title }));
      break;
    case "stopped":
      updateLiveRun(chatId, (r) => ({
        ...r,
        streaming: false,
        stopping: false,
        finished: "stopped",
        assistant: { ...r.assistant, streaming: false, stopped: true },
      }));
      break;
    case "done":
      updateLiveRun(chatId, (r) => ({
        ...r,
        streaming: false,
        finished: r.finished ?? "done",
        assistant: { ...r.assistant, streaming: false },
      }));
      break;
    case "error":
      updateLiveRun(chatId, (r) => ({
        ...r,
        streaming: false,
        finished: "error",
        // OUT_OF_CREDITS renders as the top-up banner (credits -> 0), not a raw error
        error: ev.message === "OUT_OF_CREDITS" ? null : ev.message,
        creditsRemaining: ev.message === "OUT_OF_CREDITS" ? 0 : r.creditsRemaining,
        assistant: { ...r.assistant, streaming: false },
      }));
      break;
  }
}

async function runStream(chatId: string, body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      let ev: ChatStreamEvent;
      try {
        ev = JSON.parse(json);
      } catch {
        continue;
      }
      applyEvent(chatId, ev);
    }
  }
  // Stream closed. If no terminal event arrived, mark not-streaming so the
  // finalize effect falls back to run polling to recover the real state.
  updateLiveRun(chatId, (r) => (r.streaming ? { ...r, streaming: false } : r));
}

function buildPollRun(chatId: string, run: AgentRun): LiveRun {
  return {
    chatId,
    userText: null,
    assistant: runToDisplayMessage(run),
    streaming: run.status === "running",
    stopping: false,
    finished: run.status === "running" ? null : run.status,
    error: run.error,
    creditsRemaining: null,
    titleUpdate: null,
    summaryUpdate: null,
    source: "poll",
    v: 0,
  };
}

/* ------------------------------------------------------------------ */

export default function ChatWorkspace({
  chats: initialChats,
  apiKeys,
  credits: initialCredits,
  activeChat,
  initialMessages,
}: {
  chats: Chat[];
  apiKeys: ApiKeyRow[];
  credits: number;
  activeChat: Chat | null;
  initialMessages: MessageRow[];
}) {
  const router = useRouter();
  const chatId = activeChat?.id ?? null;

  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [credits, setCredits] = useState(initialCredits);
  const [persisted, setPersisted] = useState<DisplayMessage[]>(
    initialMessages.map(fromRow)
  );
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openArtifactPath, setOpenArtifactPath] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Subscribe to the live run for the active chat ---
  const liveRun = useSyncExternalStore(
    useCallback((cb: () => void) => subscribeLiveRun(chatId ?? "", cb), [chatId]),
    useCallback(() => (chatId ? getLiveRun(chatId) : undefined), [chatId]),
    () => undefined
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const finalizeActive = useCallback(
    async (id: string) => {
      stopPolling();
      try {
        const res = await fetch(`/api/chats/${id}`);
        if (res.ok) {
          const data = await res.json();
          const rows: MessageRow[] = Array.isArray(data?.messages)
            ? data.messages
            : Array.isArray(data)
              ? data
              : (data?.chat?.messages ?? []);
          const msgs = rows
            .filter((r) => r.role === "user" || r.role === "assistant")
            .map(fromRow);
          setPersisted(msgs);
          const chat: Chat | undefined = data?.chat;
          if (chat?.title) {
            setChats((prev) =>
              prev.map((c) => (c.id === id ? { ...c, title: chat.title } : c))
            );
          }
        }
      } catch {
        /* keep the live bubble if reload fails */
      }
      setLiveRun(id, undefined);
    },
    [stopPolling]
  );

  const startPolling = useCallback(
    (id: string) => {
      if (pollRef.current) return;
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/chats/${id}/run`);
          if (!res.ok) return;
          const { run } = (await res.json()) as { run: AgentRun | null };
          if (!run) {
            stopPolling();
            setLiveRun(id, undefined);
            return;
          }
          if (run.status === "running") {
            setLiveRun(id, buildPollRun(id, run));
          } else {
            finalizeActive(id);
          }
        } catch {
          /* transient */
        }
      }, 1500);
    },
    [stopPolling, finalizeActive]
  );

  // --- Reset per-chat view state when the active thread changes ---
  useEffect(() => {
    setPersisted(initialMessages.map(fromRow));
    setCredits(initialCredits);
    setOpenArtifactPath(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // --- On mount / chat switch: attach to any background run via polling ---
  useEffect(() => {
    if (!chatId) return;
    const existing = getLiveRun(chatId);
    // A local stream is alive (soft-nav back mid-stream) — it drives updates.
    if (existing && existing.source === "stream" && existing.streaming) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/chats/${chatId}/run`);
        if (!res.ok || cancelled) return;
        const { run } = (await res.json()) as { run: AgentRun | null };
        if (cancelled) return;
        if (run && run.status === "running") {
          setLiveRun(chatId, buildPollRun(chatId, run));
          startPolling(chatId);
        } else if (getLiveRun(chatId)) {
          setLiveRun(chatId, undefined);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // --- Finalize a local stream when it ends (or recover on abnormal close) ---
  useEffect(() => {
    if (!chatId || !liveRun || liveRun.source !== "stream") return;
    if (liveRun.streaming) return;
    if (liveRun.finished) finalizeActive(chatId);
    else startPolling(chatId);
  }, [chatId, liveRun, finalizeActive, startPolling]);

  // --- Sync live run side-channels into component state ---
  useEffect(() => {
    if (liveRun?.creditsRemaining != null) setCredits(liveRun.creditsRemaining);
  }, [liveRun?.creditsRemaining]);
  useEffect(() => {
  }, [liveRun?.summaryUpdate]);
  useEffect(() => {
    if (liveRun?.titleUpdate && chatId) {
      const t = liveRun.titleUpdate;
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title: t } : c)));
    }
  }, [liveRun?.titleUpdate, chatId]);
  useEffect(() => {
    if (liveRun?.error) setError(liveRun.error);
  }, [liveRun?.error]);

  // --- Auto-open the viewer when an artifact arrives ---
  const liveArtifactCount = liveRun?.assistant.artifacts.length ?? 0;
  useEffect(() => {
    if (liveArtifactCount > 0 && openArtifactPath === null) {
      const arts = getLiveRun(chatId ?? "")?.assistant.artifacts ?? [];
      const last = arts[arts.length - 1];
      if (last) setOpenArtifactPath(last.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveArtifactCount]);

  // --- Merge persisted + live bubbles for rendering ---
  const messages: DisplayMessage[] = (() => {
    const base = [...persisted];
    if (liveRun) {
      const last = base[base.length - 1];
      const needUser =
        !!liveRun.userText &&
        !(last && last.role === "user" && last.content === liveRun.userText);
      if (needUser) {
        base.push({
          id: `u-${liveRun.assistant.id}`,
          role: "user",
          content: liveRun.userText!,
          steps: [],
          artifacts: [],
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          cost: 0,
        });
      }
      base.push(liveRun.assistant);
    }
    return base;
  })();

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // --- Conversation-level artifacts + sources for the right rail ---
  const allArtifacts: Artifact[] = messages.flatMap((m) => m.artifacts);
  const allSources: Source[] = (() => {
    const byHref = new Map<string, Source>();
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const s of extractSources(m.content)) {
        if (!byHref.has(s.href)) byHref.set(s.href, s);
      }
    }
    return [...byHref.values()];
  })();

  const openArtifact =
    openArtifactPath != null
      ? allArtifacts.find((a) => a.path === openArtifactPath) ?? null
      : null;

  // Bubbles that were appended after mount (live run) animate in; persisted
  // history renders without motion.
  const liveIds = new Set<string>();
  if (liveRun) {
    liveIds.add(liveRun.assistant.id);
    liveIds.add(`u-${liveRun.assistant.id}`);
  }

  /* ------------------------------ actions ------------------------------ */

  async function createChat(apiKeyId: string) {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeyId }),
      });
      const data = await res.json();
      if (res.ok && data.chat) {
        router.push(`/chat/${data.chat.id}`);
      } else {
        setError(data.error ?? "Failed to create research");
        setCreating(false);
      }
    } catch {
      setError("Failed to create research");
      setCreating(false);
    }
  }

  async function deleteChat(id: string) {
    setChats((prev) => prev.filter((c) => c.id !== id));
    setLiveRun(id, undefined);
    try {
      await fetch(`/api/chats/${id}`, { method: "DELETE" });
    } catch {
      /* best-effort */
    }
    if (chatId === id) {
      router.push("/chat");
      router.refresh();
    }
  }

  function send() {
    const text = input.trim();
    if (!text || !activeChat) return;
    const existing = getLiveRun(activeChat.id);
    if (existing && existing.streaming) return;

    setError(null);
    setInput("");

    const streamId = `stream-${Date.now()}`;
    const assistant: DisplayMessage = {
      id: streamId,
      role: "assistant",
      content: "",
      steps: [],
      artifacts: [],
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cost: 0,
      taskKind: null,
      streaming: true,
    };
    setLiveRun(activeChat.id, {
      chatId: activeChat.id,
      userText: text,
      assistant,
      streaming: true,
      stopping: false,
      finished: null,
      error: null,
      creditsRemaining: null,
      titleUpdate: null,
      summaryUpdate: null,
      source: "stream",
      v: 0,
    });

    // Bump this chat to the top of the sidebar.
    setChats((prev) => {
      const now = new Date().toISOString();
      const updated = prev.map((c) =>
        c.id === activeChat.id ? { ...c, updated_at: now } : c
      );
      return [...updated].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    });

    const id = activeChat.id;
    (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: id, message: text }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Request failed");
        }
        await runStream(id, res.body);
      } catch (e) {
        updateLiveRun(id, (r) => ({
          ...r,
          streaming: false,
          finished: "error",
          error: e instanceof Error ? e.message : "Something went wrong",
          assistant: { ...r.assistant, streaming: false },
        }));
      }
    })();
  }

  function stop() {
    if (!chatId) return;
    updateLiveRun(chatId, (r) => ({ ...r, stopping: true }));
    fetch(`/api/chats/${chatId}/stop`, { method: "POST" }).catch(() => {
      /* the stream will still deliver stopped/usage, or polling recovers */
    });
  }

  const streaming = !!liveRun?.streaming;
  const stopping = !!liveRun?.stopping;
  const showExamples = activeChat && messages.length === 0;
  const showRail = !openArtifact && (allArtifacts.length > 0 || allSources.length > 0);

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-bg text-ink">
      <Sidebar
        chats={chats}
        activeChatId={chatId}
        apiKeys={apiKeys}
        credits={credits}
        creating={creating}
        onCreateChat={createChat}
        onDeleteChat={deleteChat}
      />

      <main className="flex min-w-0 flex-1">
        {!activeChat ? (
          <NoChatState hasKeys={apiKeys.length > 0} />
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-col">
              <div ref={scrollRef} className="flex-1 overflow-y-auto">
                {showExamples ? (
                  <EmptyChatState onPick={(p) => setInput(p)} />
                ) : (
                  <div className="mx-auto flex w-full max-w-5xl gap-8 px-4 py-8">
                    <div className="min-w-0 flex-1 space-y-6">
                      {messages.map((m) => (
                        <MessageView
                          key={m.id}
                          message={m}
                          animate={liveIds.has(m.id)}
                          openArtifactPath={openArtifactPath}
                          onOpenArtifact={(a) => setOpenArtifactPath(a.path)}
                        />
                      ))}
                    </div>
                    {showRail && (
                      <div className="hidden lg:block">
                        <RightRail
                          artifacts={allArtifacts}
                          sources={allSources}
                          onOpenArtifact={(a) => setOpenArtifactPath(a.path)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {(credits === 0 || error) && (
                <div className="mm-fade-in mx-auto w-full max-w-3xl px-4">
                  {error ? (
                    <p className="flex items-center gap-2 rounded-lg border border-err/40 bg-err/10 px-4 py-2.5 text-sm text-err">
                      <AlertCircle size={16} />
                      {error}
                    </p>
                  ) : (
                    <div className="flex items-center justify-between rounded-lg border border-accent/40 bg-accent-dim px-4 py-2.5 text-sm text-ink">
                      <span className="flex items-center gap-2">
                        <AlertCircle size={16} className="text-accent" />
                        Out of credits — top up to continue.
                      </span>
                      <Link
                        href="/paywall"
                        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-bg transition-opacity hover:opacity-90"
                      >
                        Top up
                      </Link>
                    </div>
                  )}
                </div>
              )}

              <Composer
                value={input}
                onChange={setInput}
                onSend={send}
                onStop={stop}
                streaming={streaming}
                stopping={stopping}
                modelId={activeChat.model}
                disabled={credits === 0}
              />
            </div>

            {openArtifact && (
              <ArtifactViewer
                artifact={openArtifact}
                onClose={() => setOpenArtifactPath(null)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function NoChatState({ hasKeys }: { hasKeys: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/microManusLogo.svg" alt="" width={40} height={40} className="mb-5 rounded-lg" />
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Deep research, on your own keys
      </h1>
      <p className="mt-2 max-w-sm text-sm text-ink-dim">
        MicroManus searches the web, reasons in a loop, and produces cited reports and PDFs.
        {hasKeys
          ? " Start a new research from the sidebar."
          : " Add an API key to begin."}
      </p>
      {!hasKeys && (
        <Link
          href="/settings/keys"
          className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
        >
          Add an API key
        </Link>
      )}
    </div>
  );
}

function EmptyChatState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="mb-6 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/microManusLogo.svg" alt="" width={24} height={24} className="rounded-md" />
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-ink-dim">Micro</span>
          <span className="text-ink">Manus</span>
        </span>
      </div>
      <p className="mb-6 text-sm text-ink-dim">What should we research today?</p>
      <div className="grid w-full max-w-xl gap-2">
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm text-ink transition-colors hover:border-accent/40 hover:bg-surface-2"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
