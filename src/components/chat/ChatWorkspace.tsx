"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import type { Chat, ApiKeyRow, MessageRow, ChatStreamEvent } from "@/lib/types";
import Sidebar from "./Sidebar";
import MessageView from "./MessageView";
import Composer from "./Composer";
import { type DisplayMessage, fromRow } from "./format";

const EXAMPLE_PROMPTS = [
  "Create a report on the recent California forest fires — causes and prevention",
  "Compare the top 3 vector databases in 2026",
  "What happened in AI this week?",
];

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
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [credits, setCredits] = useState(initialCredits);
  const [messages, setMessages] = useState<DisplayMessage[]>(
    initialMessages.map(fromRow)
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const streamIdRef = useRef<string | null>(null);
  const seqRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // --- Mutate the in-flight streaming assistant message ---
  function patchStreaming(fn: (m: DisplayMessage) => DisplayMessage) {
    const id = streamIdRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }

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
    try {
      await fetch(`/api/chats/${id}`, { method: "DELETE" });
    } catch {
      // best-effort
    }
    if (activeChat?.id === id) {
      router.push("/chat");
      router.refresh();
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming || !activeChat) return;

    setError(null);
    setOutOfCredits(false);
    setInput("");

    const seq = ++seqRef.current;
    const userMsg: DisplayMessage = {
      id: `user-${seq}`,
      role: "user",
      content: text,
      steps: [],
      artifacts: [],
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cost: 0,
    };
    const streamId = `stream-${seq}`;
    streamIdRef.current = streamId;
    const assistantMsg: DisplayMessage = {
      id: streamId,
      role: "assistant",
      content: "",
      steps: [],
      artifacts: [],
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      cost: 0,
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    // Bump this chat to the top of the sidebar.
    setChats((prev) => {
      const now = new Date().toISOString();
      const updated = prev.map((c) =>
        c.id === activeChat.id ? { ...c, updated_at: now } : c
      );
      return [...updated].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: activeChat.id, message: text }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Request failed");
      }
      await readStream(res.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      patchStreaming((m) => ({ ...m, streaming: false }));
      streamIdRef.current = null;
      setStreaming(false);
    }
  }

  async function readStream(body: ReadableStream<Uint8Array>) {
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
        let event: ChatStreamEvent;
        try {
          event = JSON.parse(json);
        } catch {
          continue;
        }
        handleEvent(event);
      }
    }
  }

  function handleEvent(event: ChatStreamEvent) {
    switch (event.type) {
      case "step":
        patchStreaming((m) => ({ ...m, steps: [...m.steps, event.step] }));
        break;
      case "delta":
        patchStreaming((m) => ({ ...m, content: m.content + event.text }));
        break;
      case "artifact":
        patchStreaming((m) => ({ ...m, artifacts: [...m.artifacts, event.artifact] }));
        break;
      case "usage":
        patchStreaming((m) => ({
          ...m,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cachedTokens: event.cachedTokens,
          cost: event.cost,
        }));
        setCredits(event.creditsRemaining);
        break;
      case "title":
        if (activeChat) {
          setChats((prev) =>
            prev.map((c) => (c.id === activeChat.id ? { ...c, title: event.title } : c))
          );
        }
        break;
      case "error":
        if (event.message === "OUT_OF_CREDITS") {
          setOutOfCredits(true);
        } else {
          setError(event.message);
        }
        break;
      case "done":
        patchStreaming((m) => ({ ...m, streaming: false }));
        break;
    }
  }

  const showExamples = activeChat && messages.length === 0;

  return (
    <div className="fixed inset-0 flex bg-bg text-ink">
      <Sidebar
        chats={chats}
        activeChatId={activeChat?.id ?? null}
        apiKeys={apiKeys}
        credits={credits}
        creating={creating}
        onCreateChat={createChat}
        onDeleteChat={deleteChat}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {!activeChat ? (
          <NoChatState hasKeys={apiKeys.length > 0} />
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              {showExamples ? (
                <EmptyChatState onPick={(p) => setInput(p)} />
              ) : (
                <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
                  {messages.map((m) => (
                    <MessageView key={m.id} message={m} />
                  ))}
                </div>
              )}
            </div>

            {(outOfCredits || error) && (
              <div className="mx-auto w-full max-w-3xl px-4">
                {outOfCredits ? (
                  <div className="flex items-center justify-between rounded-lg border border-accent/40 bg-accent-dim px-4 py-2.5 text-sm text-ink">
                    <span className="flex items-center gap-2">
                      <AlertCircle size={16} className="text-accent" />
                      You&apos;re out of credits.
                    </span>
                    <Link
                      href="/paywall"
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-bg hover:opacity-90"
                    >
                      Top up
                    </Link>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 rounded-lg border border-err/40 bg-err/10 px-4 py-2.5 text-sm text-err">
                    <AlertCircle size={16} />
                    {error}
                  </p>
                )}
              </div>
            )}

            <Composer
              value={input}
              onChange={setInput}
              onSend={send}
              disabled={streaming}
              modelId={activeChat.model}
            />
          </>
        )}
      </main>
    </div>
  );
}

function NoChatState({ hasKeys }: { hasKeys: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 h-6 w-6 rounded-md bg-accent" />
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
          className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
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
        <span className="h-5 w-5 rounded-md bg-accent" />
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
