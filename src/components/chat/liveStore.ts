import type { DisplayMessage } from "./format";

/**
 * Module-level registry of in-flight runs keyed by chatId. Because thread
 * navigation may remount ChatWorkspace (client-side or full nav), keeping the
 * live stream state OUTSIDE React means switching away from a streaming chat
 * and back does not destroy its progress. The run-polling fallback in
 * ChatWorkspace recovers state after a hard reload where this map is empty.
 */
export interface LiveRun {
  chatId: string;
  /** optimistic user text that started this run (null for background/poll runs) */
  userText: string | null;
  /** the live assistant bubble being built */
  assistant: DisplayMessage;
  streaming: boolean;
  stopping: boolean;
  /** terminal marker once the stream/poll ends: done | stopped | error */
  finished: "done" | "stopped" | "error" | null;
  error: string | null;
  creditsRemaining: number | null;
  titleUpdate: string | null;
  summaryUpdate: string | null;
  source: "stream" | "poll";
  /** bumped on every mutation so useSyncExternalStore sees a new snapshot */
  v: number;
}

const runs = new Map<string, LiveRun>();
const listeners = new Map<string, Set<() => void>>();

function emit(chatId: string) {
  listeners.get(chatId)?.forEach((fn) => fn());
}

export function getLiveRun(chatId: string): LiveRun | undefined {
  return runs.get(chatId);
}

export function setLiveRun(chatId: string, run: LiveRun | undefined) {
  if (run) runs.set(chatId, run);
  else runs.delete(chatId);
  emit(chatId);
}

export function updateLiveRun(chatId: string, fn: (r: LiveRun) => LiveRun) {
  const cur = runs.get(chatId);
  if (!cur) return;
  const next = fn(cur);
  // No-op reducers must not create a new snapshot (avoids spurious re-renders
  // and double-finalize when a terminal event has already been applied).
  if (next === cur) return;
  runs.set(chatId, { ...next, v: cur.v + 1 });
  emit(chatId);
}

export function subscribeLiveRun(chatId: string, cb: () => void): () => void {
  let set = listeners.get(chatId);
  if (!set) {
    set = new Set();
    listeners.set(chatId, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}
