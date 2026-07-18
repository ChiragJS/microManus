You are implementing the "settings & usage" feature of MicroManus in THIS directory (/home/chirag/coding/mm-wt-usage — a git worktree on branch feature/settings-usage). Read AGENTS.md and DESIGN.md first — they define the product, shared contracts, and design tokens. Do NOT modify shared contract files (src/lib/*, supabase/schema.sql, src/middleware.ts, src/app/layout.tsx, src/app/globals.css). Build only what is listed below.

## Deliverable 1: API key management — /settings/keys
- `src/app/settings/keys/page.tsx` (server component: require auth via src/lib/supabase/server.ts createClient + auth.getUser; fetch the user's api_keys rows) + client components under `src/components/settings/`.
- UI: list of saved keys as cards/rows: provider name, model name (from MODELS in src/lib/pricing.ts), masked key hint (store nothing plaintext client side — show label or "••••"), created date, delete button.
- "Add key" form: provider select (PROVIDERS from src/lib/pricing.ts: openai, anthropic, kimi, custom) → base URL input auto-filled from PROVIDERS[provider].baseUrl (editable only when provider=custom), model select populated from modelsForProvider(provider) showing name + pricing ("$3 / $15 per 1M"), api key password input (placeholder from PROVIDERS[provider].keyPlaceholder), optional label. Show a hint link to PROVIDERS[provider].keyUrl ("Get a key →").
- Route handlers `src/app/api/keys/route.ts`: GET (list own keys, NEVER return api_key_encrypted — select only id, provider, base_url, model, label, created_at), POST (validate provider/model/baseUrl/key non-empty; encrypt key with `encrypt()` from src/lib/crypto.ts; insert row for auth user), and `src/app/api/keys/[id]/route.ts`: DELETE (delete own row by id).
- After add/delete, refresh the list (router.refresh() or refetch).

## Deliverable 2: Usage & cost stats — /usage
- `src/app/usage/page.tsx` (server component, require auth). Fetch user's chats and all their messages (select chat_id, input_tokens, output_tokens, cached_tokens, cost from messages), aggregate per chat in JS.
- Top summary cards (4): Total spend ($ 4 decimals, font-mono), Total tokens (in+out+cached), Chats count, Credits remaining (from profiles row).
- Per-chat table: columns Chat (title, links to /chat/{id}), Model, Messages count, Input tokens, Cached tokens, Output tokens, Input cost, Output cost, Cached cost, Total cost. Use `costBreakdown(model, {inputTokens, outputTokens, cachedTokens})` from src/lib/pricing.ts for the cost columns (or sum the stored per-message `cost` for total — prefer costBreakdown for the split, stored cost sum for total). Sort by total cost desc. Empty state if no chats.
- All numbers font-mono, thousands separators, costs $X.XXXX.

## Shared bits you build (namespaced to avoid merge conflicts)
- `src/components/settings/TopNav.tsx`: slim top bar used by BOTH pages: left = wordmark ("Micro" in text-ink-dim + "Manus" in text-ink, preceded by a 8px bg-accent square), center/right links: Chat (/chat), Usage (/usage), API Keys (/settings/keys), then credits badge (font-mono) and a Sign out button (client: supabase.auth.signOut() from src/lib/supabase/client.ts then window.location.href = "/login").

## Rules
- Dark UI only, use token classes from AGENTS.md (bg-bg, bg-surface, bg-surface-2, border-line, text-ink, text-ink-dim, text-accent, bg-accent, bg-accent-dim, text-ok, text-err). lucide-react icons at 16px.
- TypeScript strict; use types from src/lib/types.ts.
- Verify with: `export PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH && bun run build` — it MUST pass with zero type errors before you finish.
- When done: `git add -A && git commit -m "feat: API key management and usage stats pages"` on this branch.
