<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MicroManus — project context

Deep research AI agent web app with usage-based billing. Next.js 15 (App Router, TS, Tailwind v4), Supabase (auth Google/GitHub + Postgres + storage), Stripe test mode, Brave Search. Deployed on Vercel. Package manager: **bun** (registry overridden to public npm in `.npmrc`/`bunfig.toml`).

## Product flow
1. Social login only (Google/GitHub) via Supabase OAuth → `/auth/callback`.
2. After signup user is LOCKED (`profiles.unlocked=false`). Paywall at `/paywall`: coupon `SID_DRDROID` (one-time, RPC `redeem_coupon`) OR pay $5 via Stripe Checkout. Either grants 5 credits + unlock.
3. `/chat` — conversation threads with a deep-research agent (think → tool call → observe → loop). Tools: Brave web search, fetch URL, create PDF report (stored in Supabase storage bucket `artifacts`).
4. 1 credit consumed per agent run (RPC `consume_credit`, returns -1 if insufficient → show top-up).
5. User brings their own LLM API key at `/settings/keys` (provider + base URL + key + model). Never preload keys.
6. `/usage` — per-chat cost & token stats (input/output/cached breakdown).

## Shared contracts (DO NOT redesign; use as-is)
- DB schema + RLS + RPCs: `supabase/schema.sql` (tables: profiles, api_keys, chats, messages, credit_events)
- Types: `src/lib/types.ts` (Profile, ApiKeyRow, Chat, MessageRow, AgentStep, Artifact, ChatStreamEvent)
- Pricing/models: `src/lib/pricing.ts` (PROVIDERS, MODELS, calcCost, costBreakdown)
- LLM client: `src/lib/llm.ts` — `chatCompletion()` normalizes OpenAI-compat and Anthropic-native (with prompt caching); returns `{content, toolCalls, usage, stopReason}`
- API key encryption: `src/lib/crypto.ts` (encrypt/decrypt/maskKey, AES-256-GCM via APP_ENCRYPTION_SECRET)
- Supabase clients: `src/lib/supabase/{client,server,admin}.ts`
- Auth proxy (middleware): `src/proxy.ts` (protects /chat /settings /usage /paywall; redirects logged-in users away from / and /login)
- Env vars: `.env.example`

## Design
Follow `DESIGN.md` strictly. Dark-only, tokens in `src/app/globals.css` (Tailwind v4 `@theme inline`: use classes like `bg-bg`, `bg-surface`, `bg-surface-2`, `border-line`, `text-ink`, `text-ink-dim`, `text-accent`, `bg-accent`, `bg-accent-dim`, `text-ok`, `text-err`, `font-mono`).

## Conventions
- Route handlers under `src/app/api/**/route.ts`; check auth via `createClient()` from `src/lib/supabase/server.ts` + `supabase.auth.getUser()`.
- Money display: `$` + 4 decimals, `font-mono`. Tokens: `font-mono` with thousands separators.
- `bun run build` must pass (`next build`). Do not add new heavy deps without need. lucide-react is available for icons.
