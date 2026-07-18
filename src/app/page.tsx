import Link from "next/link";
import {
  ArrowUpRight,
  Globe,
  FileText,
  KeyRound,
  History,
  LogIn,
  Ticket,
  Search,
} from "lucide-react";
import { Wordmark } from "@/components/wordmark";

const STEPS = [
  {
    n: "01",
    icon: LogIn,
    title: "Sign in",
    body: "One tap with Google or GitHub. No passwords, no forms.",
  },
  {
    n: "02",
    icon: Ticket,
    title: "Unlock",
    body: "Redeem a coupon, or pay $5 for 5 research credits.",
  },
  {
    n: "03",
    icon: Search,
    title: "Research",
    body: "Add your own LLM API key and dispatch the agent.",
  },
];

const FEATURES = [
  {
    icon: Globe,
    title: "Agentic web research",
    body: "The agent thinks, searches Brave, fetches pages, and loops until the question is answered.",
  },
  {
    icon: FileText,
    title: "Cited PDF reports",
    body: "Every run ends in a structured report with inline citations, exported as a downloadable PDF.",
  },
  {
    icon: KeyRound,
    title: "Bring your own key",
    body: "OpenAI, Anthropic, or any compatible endpoint. Per-token cost tracked to four decimals.",
  },
  {
    icon: History,
    title: "Thread history",
    body: "Every investigation is a thread you can revisit, branch from, and audit for spend.",
  },
];

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-bg text-ink">
      {/* faint grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 80% 55% at 50% 0%, black 40%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 55% at 50% 0%, black 40%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col px-6">
        {/* nav */}
        <header className="flex items-center justify-between py-6">
          <Wordmark />
          <Link
            href="/login"
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-dim transition-colors duration-150 hover:border-ink-dim hover:text-ink"
          >
            Sign in
            <ArrowUpRight size={15} />
          </Link>
        </header>

        {/* hero */}
        <section className="flex flex-col items-start gap-6 pt-20 pb-16 sm:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs text-ink-dim">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />
            deep research agent · test mode
          </span>
          <h1 className="max-w-3xl text-4xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
            Deep research,
            <br />
            <span className="text-ink-dim">on your own </span>
            <span className="text-accent">keys.</span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-ink-dim sm:text-lg">
            MicroManus runs an agentic loop over live web search — think, search,
            read, repeat — and hands back a cited report. You supply the LLM key;
            you see every token it costs.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/login"
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-bg transition-opacity duration-150 hover:opacity-90"
            >
              Sign up free
              <ArrowUpRight size={16} />
            </Link>
            <span className="font-mono text-xs text-ink-dim">
              $5 → 5 credits · 1 credit / run
            </span>
          </div>
        </section>

        {/* how it works */}
        <section className="border-t border-line py-14">
          <div className="mb-8 flex items-baseline gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-accent">
              How it works
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
            {STEPS.map(({ n, icon: Icon, title, body }) => (
              <li key={n} className="flex flex-col gap-3 bg-surface p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-accent">{n}</span>
                  <Icon size={16} className="text-ink-dim" />
                </div>
                <h3 className="text-lg font-medium tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-dim">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* feature grid */}
        <section className="border-t border-line py-14">
          <div className="mb-8 flex items-baseline gap-3">
            <span className="font-mono text-xs uppercase tracking-widest text-accent">
              Instrumentation
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group flex gap-4 bg-surface p-6 transition-colors duration-150 hover:bg-surface-2"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-bg text-ink-dim transition-colors duration-150 group-hover:text-accent">
                  <Icon size={17} />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="font-medium tracking-tight">{title}</h3>
                  <p className="text-sm leading-relaxed text-ink-dim">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* footer CTA */}
        <section className="mt-auto flex flex-col items-start gap-5 border-t border-line py-14 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-medium tracking-tight">
              Start your first investigation.
            </h2>
            <p className="text-sm text-ink-dim">
              Free to sign up. Unlock with a coupon or $5.
            </p>
          </div>
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-bg transition-opacity duration-150 hover:opacity-90"
          >
            Sign up
            <ArrowUpRight size={16} />
          </Link>
        </section>

        <footer className="flex items-center justify-between border-t border-line py-6 text-xs text-ink-dim">
          <Wordmark />
          <span className="font-mono">Deep research, on your own keys.</span>
        </footer>
      </div>
    </div>
  );
}
