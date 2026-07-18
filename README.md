<p align="center">
  <img src="public/microManusLogo.svg" width="80" alt="MicroManus" />
</p>

<h1 align="center">MicroManus</h1>

<p align="center"><b>Deep research, on your own keys.</b></p>

MicroManus is a deep-research AI agent. Ask it a question and it plans, searches the web, reads sources, cross-checks claims, and writes a cited answer — or a full PDF report — while you watch every step of its reasoning live.

It runs on **your** LLM API key. You choose the provider and model; MicroManus meters every token and shows you exactly what each conversation cost.

## What it does

- **Agentic research loop** — think → search → read → verify → synthesize, up to 12 tool iterations per run, streamed live: thinking ticker, search/read steps, then the answer.
- **Cited answers** — inline source pills with site favicons; hover to preview, click through to the source.
- **PDF report artifacts** — when a deliverable is warranted, the agent writes a structured report, rendered as a styled PDF in a Manus-style split viewer and downloadable.
- **Task-aware billing** — casual chat is free, a research run costs 1 credit, a report costs 2. Credits come from a $5 top-up (Stripe) or an invite coupon.
- **Bring your own key** — OpenAI, Anthropic, Kimi (Moonshot), or any OpenAI-compatible endpoint. Keys are AES-256-GCM encrypted at rest and never leave the server.
- **Real cost analytics** — per-message token metering (input / output / cached) priced with live model rates (LiteLLM + OpenRouter price feeds, daily-cached, static fallback), aggregated per chat at `/usage`.
- **Prompt caching everywhere** — native Anthropic `cache_control` breakpoints; automatic caching on OpenAI/Kimi. Cached tokens are billed at cached rates in the analytics.
- **Threads that survive** — switch chats mid-research and come back: the run keeps going server-side and the UI reattaches. Stop a run gracefully mid-flight.

## Stack

Next.js (App Router) · Supabase (GitHub OAuth, Postgres + RLS, storage) · Stripe embedded checkout · Brave Search · @react-pdf/renderer · Tailwind v4

## How a run works

```
user message
   └─ classify: chat | research | report
        └─ loop (≤12): think → web_search / fetch_url → observe
             └─ create_pdf_report (if deliverable)
                  └─ cited answer + usage (tokens, $, credits) streamed as SSE
```

Deployment notes live in [docs/SETUP.md](docs/SETUP.md).
