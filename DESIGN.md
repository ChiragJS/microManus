# MicroManus — Design Language

All pages MUST follow this so the app feels like one product. Dark-only UI.

## Vibe
A focused research instrument. Dense, calm, precise — closer to a terminal/observatory than a SaaS landing page. No purple gradients, no glassmorphism, no emoji headers.

## Tokens (defined in `src/app/globals.css`)
- `--bg`: #0B0C10 (page background)
- `--surface`: #13151C (cards, sidebar)
- `--surface-2`: #1A1D26 (hover, inputs)
- `--border`: #262A36
- `--text`: #E8E6E1 (primary text, warm off-white)
- `--text-dim`: #8A8F9E
- `--accent`: #E8703A (signal orange — buttons, active states, links)
- `--accent-dim`: rgba(232,112,58,0.12) (accent backgrounds)
- `--ok`: #4CAF7D, `--err`: #E05252

## Type
- UI: Geist Sans (already wired in layout as `--font-geist-sans`)
- Numbers/code/token counts/costs: Geist Mono (`--font-geist-mono`)
- Headings: Geist Sans, tight tracking (`tracking-tight`), medium weight. No serif.

## Components
- Buttons: rounded-lg, accent bg with #0B0C10 text for primary; bordered `--border` transparent bg for secondary. Subtle 150ms transitions.
- Cards: `--surface` bg, 1px `--border`, rounded-xl.
- Inputs: `--surface-2` bg, 1px border, focus ring in accent at 40% opacity.
- Use `lucide-react` icons at 16px, `--text-dim` color.
- Monospace for anything numeric: credits, tokens, $ costs (4 decimal places, e.g. `$0.0231`).

## Brand
Wordmark: "MicroManus" — "Micro" in `--text-dim`, "Manus" in `--text`, with a small accent-colored square/dot glyph before it. Tagline: "Deep research, on your own keys."
