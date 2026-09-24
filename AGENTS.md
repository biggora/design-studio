# AGENTS.md

This file provides guidance to Ai Agents when working with code in this repository.

## What this is

Design Studio is a self-hostable, white-label print-on-demand storefront (Next.js 16 App Router, React 19, Tailwind 3). It mirrors an artist's Redbubble shop into a searchable catalog and sends buyers to the marketplace to purchase — there is no checkout and no admin UI. See `PRODUCT.md` (users, purpose) and `DESIGN.md` (visual system) before UI work; `docs/` holds deeper Russian-language docs (architecture, database, sync, deployment) that may lag the code — trust the source when they disagree.

## Commands

```bash
npm run dev              # dev server on :3000
npm run build            # production build (also type-checks)
npm run lint             # eslint . (next core-web-vitals + typescript)
npm test                 # vitest run (node env, "@" alias → repo root)
npx vitest run lib/utils.test.ts          # single file
npx vitest run -t "formatDate"            # single test by name
npm run sync:redbubble   # run the Redbubble → DB sync via tsx (reads .env)
npm run sync:redbubble:dry  # preview the sync (no writes) via --dry-run, prints the insert/update plan
npx playwright install chromium           # needed once for Playwright sync mode
```

## Architecture

**Data access goes only through `utils/database.ts`.** It is a dual-provider facade selected by `DATABASE_PROVIDER` (`supabase` default, or `mysql`); clients are created lazily (`getSupabase()`, `getMySQLPool()` — the MySQL pool is cached on `globalThis` to survive HMR). Every exported query (`getSiteConfig`, `fetchDesigns`, `getDesignById`, `fetchCollections`) branches on the provider, so any new query must be implemented for **both** backends and return the same normalized `Design` shape (`types/design.ts`). SQL schema and stored functions (`get_random_designs`) live in `init/` for both Postgres and MySQL — keep them in sync.

**Configuration is layered:** `config/config.json` (defaults) → rows of the `studio` table (`key`/`value`, dot-notation keys like `social.twitter` or `representation.redbubbleShopUrl` are expanded into nested objects by `mapDataToConfig` in `lib/config.ts`, which deep-clones the base and blocks prototype-pollution keys) → env vars for secrets. `app/layout.tsx` calls `getSiteConfig()` on the server and passes the result to client components through `ConfigContext` in `app/wrapper.tsx`; client components read config via `useContext(ConfigContext)`. The `SiteConfig` type lives in `lib/store.ts` (which also has a Zustand store seeded from the JSON defaults). `getSiteConfig` is cached (React `cache` wrapping `unstable_cache`, tag `site-config`, 5-min TTL, invalidated by `POST /api/revalidate/config`); code that runs outside the Next.js runtime (CLI scripts, tests) must import the uncached `loadSiteConfig` instead.

**Sync pipeline** (`lib/sync/redbubble.ts`): scrapes the public Redbubble shop with Playwright (stealth Chromium, persisted storage state for Cloudflare) or falls back to Cheerio JSON-LD parsing, paced by `RequestPacer` (min interval + jitter), then upserts into `designs`. Note it always writes to **Supabase** (`syncRedbubbleToSupabase`) regardless of `DATABASE_PROVIDER`. Entry points: `scripts/sync-redbubble.ts` (CLI) and `POST /api/sync/redbubble` (requires `SYNC_SECRET` via `Authorization: Bearer` or `x-sync-secret`, constant-time compared; in-process lock returns 409 on concurrent runs). Tuning env vars are listed in `.env.example`. Playwright sessions don't persist on serverless — run the sync on a machine/VM when Cloudflare challenges appear (first run with `SYNC_PLAYWRIGHT_HEADLESS=false`).

**Rendering:** pages are Server Components by default and query the DB directly through the facade; `"use client"` only where hooks/browser APIs are needed (search bar, cookie banner via `useSyncExternalStore`, carousel, contact form, header/footer). SEO pieces: per-page `metadata`/`generateMetadata`, `app/sitemap.ts`, `app/robots.ts`, `app/components/JsonLd.tsx`. Remote images are allowed only from `*.redbubble.com`, `*.redbubble.net`, `*.placeholder.com` (`next.config.mjs`), which also sets global security headers.

## Styling / design system

- Colors and radii are HSL CSS variables in `app/globals.css` (`:root`), mapped to Tailwind semantic names in `tailwind.config.ts` (`bg-primary`, `text-accent`, `border-input`, …). Use those tokens, never literal color values — deployments re-skin by overriding the variables or via the `themeLink` config (validated by `isAllowedThemeUrl` in `app/layout.tsx`).
- UI primitives are shadcn/ui ("new-york", `components/ui/`); site-specific components live in `app/components/`. Use `cn()` from `lib/utils.ts` for class merging.
- `DESIGN.md` defines the palette names (Loom Ink, Indigo Thread as the single interactive hue, etc.), typography scale, and rules — follow it for any visual change.
