# Deployment setup

Internal notes for deploying MicroManus.

## Env vars

See `.env.example`. `APP_ENCRYPTION_SECRET` encrypts user API keys at rest (AES-256-GCM) — generate with `openssl rand -hex 32`.

## 1. Supabase
1. Create a project at supabase.com.
2. SQL editor → run `supabase/schema.sql` (tables, RLS, RPCs, storage bucket).
3. Auth → Providers: enable **GitHub** (create a GitHub OAuth app; callback URL is `https://YOUR_PROJECT.supabase.co/auth/v1/callback`).
4. Auth → URL Configuration: set Site URL to the deployed URL, add `http://localhost:3000/**` and `https://YOUR_APP.vercel.app/**` to redirect URLs.
5. Copy Project URL, anon key, service-role key into env vars.

## 2. Stripe (test mode)
1. Get test keys from dashboard.stripe.com (`sk_test_...`).
2. Add a webhook endpoint `https://YOUR_APP/api/stripe/webhook` for event `checkout.session.completed`; copy the signing secret to `STRIPE_WEBHOOK_SECRET`. (The app also confirms sessions on redirect, so it works even before the webhook is configured.)

## 3. Brave Search
Get a free API key at [brave.com/search/api](https://brave.com/search/api) → `BRAVE_SEARCH_API_KEY`.

## 4. Vercel
1. Import the repo, framework = Next.js, install command `bun install`.
2. Add all env vars from `.env.example` (set `NEXT_PUBLIC_SITE_URL` to the deployed URL).
3. Update Supabase redirect URLs and the Stripe webhook to the production domain.

## Local development

```bash
bun install
cp .env.example .env.local   # fill in values
bun run dev
```
