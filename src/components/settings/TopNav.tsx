"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/chat", label: "Chat" },
  { href: "/usage", label: "Usage" },
  { href: "/settings/keys", label: "API Keys" },
];

export default function TopNav({ credits }: { credits: number }) {
  const pathname = usePathname();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-4">
        <Link href="/chat" className="flex items-center gap-2 text-sm font-medium tracking-tight">
          <span className="inline-block h-2 w-2 bg-accent" aria-hidden />
          <span>
            <span className="text-ink-dim">Micro</span>
            <span className="text-ink">Manus</span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 ${
                  active ? "text-accent" : "text-ink-dim hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1">
          <Coins size={16} className="text-ink-dim" aria-hidden />
          <span className="font-mono text-xs text-ink">{credits}</span>
          <span className="text-xs text-ink-dim">credits</span>
        </div>

        <button
          onClick={signOut}
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-dim transition-colors duration-150 hover:text-ink"
        >
          <LogOut size={16} aria-hidden />
          Sign out
        </button>
      </div>
    </header>
  );
}
