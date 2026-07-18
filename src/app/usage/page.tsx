import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Coins,
  MessagesSquare,
  Sigma,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { costBreakdown, getModel } from "@/lib/pricing";
import { getLivePricing } from "@/lib/pricing-live";
import type { Chat, MessageRow, Profile } from "@/lib/types";
import TopNav from "@/components/settings/TopNav";

export const dynamic = "force-dynamic";

type MsgUsage = Pick<
  MessageRow,
  "chat_id" | "input_tokens" | "output_tokens" | "cached_tokens" | "cost"
>;
type ChatMeta = Pick<Chat, "id" | "title" | "model">;

const fmtNum = (n: number) => n.toLocaleString("en-US");
const fmtCost = (n: number) => `$${n.toFixed(4)}`;

export default async function UsagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: chats }, { data: messages }, { data: profile }] =
    await Promise.all([
      supabase
        .from("chats")
        .select("id, title, model")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("messages")
        .select("chat_id, input_tokens, output_tokens, cached_tokens, cost")
        .eq("user_id", user.id),
      supabase.from("profiles").select("credits").eq("id", user.id).single(),
    ]);

  const chatList = (chats as ChatMeta[] | null) ?? [];
  const msgList = (messages as MsgUsage[] | null) ?? [];
  const pricing = await getLivePricing(); // daily-cached live rates, static fallback
  const credits = (profile as Pick<Profile, "credits"> | null)?.credits ?? 0;

  const rows = chatList
    .map((chat) => {
      const msgs = msgList.filter((m) => m.chat_id === chat.id);
      const usage = msgs.reduce(
        (acc, m) => ({
          inputTokens: acc.inputTokens + (m.input_tokens ?? 0),
          outputTokens: acc.outputTokens + (m.output_tokens ?? 0),
          cachedTokens: acc.cachedTokens + (m.cached_tokens ?? 0),
        }),
        { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
      );
      const storedTotal = msgs.reduce((acc, m) => acc + (m.cost ?? 0), 0);
      const split = costBreakdown(chat.model, usage, pricing[chat.model]);
      return {
        chat,
        messageCount: msgs.length,
        usage,
        split,
        total: storedTotal,
      };
    })
    .sort((a, b) => b.total - a.total);

  const totalSpend = rows.reduce((acc, r) => acc + r.total, 0);
  const totalTokens = rows.reduce(
    (acc, r) =>
      acc +
      r.usage.inputTokens +
      r.usage.outputTokens +
      r.usage.cachedTokens,
    0
  );

  const cards = [
    { icon: Wallet, label: "Total spend", value: fmtCost(totalSpend) },
    { icon: Sigma, label: "Total tokens", value: fmtNum(totalTokens) },
    { icon: MessagesSquare, label: "Chats", value: fmtNum(chatList.length) },
    { icon: Coins, label: "Credits remaining", value: fmtNum(credits) },
  ];

  return (
    <div className="min-h-full">
      <TopNav credits={credits} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-lg font-medium tracking-tight text-ink">Usage</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Per-chat token and cost breakdown across all your research sessions.
        </p>

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-line bg-surface p-4"
            >
              <div className="flex items-center gap-2 text-xs text-ink-dim">
                <c.icon size={16} aria-hidden />
                {c.label}
              </div>
              <div className="mt-2 font-mono text-xl text-ink">{c.value}</div>
            </div>
          ))}
        </section>

        <section className="mt-8">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-surface px-5 py-12 text-center">
              <BarChart3
                size={16}
                className="mx-auto text-ink-dim"
                aria-hidden
              />
              <p className="mt-3 text-sm text-ink-dim">
                No chats yet — start a research session to see usage stats.
              </p>
              <Link
                href="/chat"
                className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition-colors duration-150 hover:opacity-90"
              >
                Start chatting
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-dim">
                    <th className="px-4 py-3 font-medium">Chat</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 text-right font-medium">Msgs</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Input tok
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Cached tok
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Output tok
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Input cost
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Output cost
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Cached cost
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ chat, messageCount, usage, split, total }) => (
                    <tr
                      key={chat.id}
                      className="border-b border-line/60 transition-colors duration-150 last:border-0 hover:bg-surface-2"
                    >
                      <td className="max-w-[220px] truncate px-4 py-3">
                        <Link
                          href={`/chat/${chat.id}`}
                          className="text-ink transition-colors duration-150 hover:text-accent"
                        >
                          {chat.title || "Untitled chat"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-dim">
                        {getModel(chat.model)?.name ?? chat.model}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink-dim">
                        {fmtNum(messageCount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {fmtNum(usage.inputTokens)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {fmtNum(usage.cachedTokens)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {fmtNum(usage.outputTokens)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink-dim">
                        {fmtCost(split.inputCost)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink-dim">
                        {fmtCost(split.outputCost)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink-dim">
                        {fmtCost(split.cachedCost)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink">
                        {fmtCost(total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
