# MicroManus

**Deep research, on your own keys.** A deep-research AI agent with usage-based billing: social login, a $5 / coupon paywall granting research credits, an agentic loop (think → search → read → synthesize) with web access, PDF report artifacts, bring-your-own LLM API key (OpenAI-compatible + Anthropic), and per-chat cost/token analytics with input / output / cached breakdown.

## Stack

- **Next.js 15** (App Router, TypeScript, Tailwind v4) — deployed on Vercel
- **Supabase** — GitHub OAuth, Postgres (RLS), storage for PDF artifacts
- **Stripe** (test mode) — $5 checkout → 5 credits; coupon `SID_DRDROID` as bypass
- **Brave Search API** — the agent's web access
- **LLM**: user-supplied keys. OpenAI / Kimi (Moonshot) / any OpenAI-compatible endpoint via `/chat/completions`; Anthropic via native Messages API with prompt caching (`cache_control`). Usage normalized to input / output / cached tokens; cost computed from the model chosen when the key was added (`src/lib/pricing.ts`).

## How billing works

- 1 credit = 1 agent research run (one user message through the full tool loop).
- Unlock: redeem `SID_DRDROID` (one-time) **or** pay $5 (Stripe test card `4242 4242 4242 4242`). Both grant 5 credits. Top-ups repeat the $5 purchase.
- LLM token costs are tracked per message and aggregated per chat at `/usage`.

## Local development

```bash
bun install
cp .env.example .env.local   # fill in values (see below)
bun run dev
```

## Setup (one-time)

### 1. Supabase
1. Create a project at supabase.com.
2. SQL editor → run `supabase/schema.sql` (tables, RLS, RPCs, storage bucket).
3. Auth → Providers: enable **GitHub** (create a GitHub OAuth app; callback URL is `https://YOUR_PROJECT.supabase.co/auth/v1/callback`).
4. Auth → URL Configuration: set Site URL to the deployed URL, add `http://localhost:3000/**` and `https://YOUR_APP.vercel.app/**` to redirect URLs.
5. Copy Project URL, anon key, service-role key into env vars.

### 2. Stripe (test mode)
1. Get test keys from dashboard.stripe.com (`sk_test_...`).
2. Add a webhook endpoint `https://YOUR_APP/api/stripe/webhook` for event `checkout.session.completed`; copy the signing secret to `STRIPE_WEBHOOK_SECRET`. (The app also confirms sessions on redirect, so it works even before the webhook is configured.)

### 3. Brave Search
Get a free API key at [brave.com/search/api](https://brave.com/search/api) → `BRAVE_SEARCH_API_KEY`.

### 4. Deploy (Vercel)
1. Import the repo in Vercel, framework = Next.js, install command `bun install`.
2. Add all env vars from `.env.example` (set `NEXT_PUBLIC_SITE_URL` to the deployed URL).
3. Update Supabase redirect URLs and the Stripe webhook to the production domain.

## Env vars

See `.env.example`. `APP_ENCRYPTION_SECRET` encrypts user API keys at rest (AES-256-GCM) — generate with `openssl rand -hex 32`.

## Architecture notes

- `src/lib/llm.ts` — one `chatCompletion()` across providers; Anthropic path adds `cache_control` breakpoints (system + last turn) so every loop iteration reads the previous iteration's cache; OpenAI/Kimi rely on automatic prompt caching. Cached tokens are read from `usage.prompt_tokens_details.cached_tokens` (OpenAI-shape) / `cache_read_input_tokens` (Anthropic) and billed at the model's cached rate.
- `src/app/api/chat/route.ts` — the agent loop (max 12 iterations) streaming SSE events: tool steps, answer deltas, artifacts, usage.
- Tools: `web_search` (Brave), `fetch_url` (readable-text extraction), `create_pdf_report` (markdown → styled PDF via @react-pdf/renderer → Supabase storage).
- Credits are consumed atomically via the `consume_credit` RPC; coupon redemption via `redeem_coupon` (server-side check, one-time per user).
