# Release Plan: Design Studio (v0.1.0)

> **Historical document.** This is the original release plan for **v0.1.0**, kept for reference.
> It reflects the codebase **as of that release**: dependency versions, test counts (12 tests at
> the time), and endpoint behavior all describe v0.1.0 and have changed since — for example, the
> sync API route later became POST-only with header-based authentication, dropping the
> `?secret=` query parameter shown in Step 3 below.
> The **current** state of the project is documented in `README.md` and the sibling documents in
> `docs/` (`ARCHITECTURE.md`, `DATABASE.md`, `SYNC_SYSTEM.md`, `FRONTEND_AND_UI.md`,
> `DEPLOYMENT_AND_CONFIGURATION.md`).

## 1. Release Summary

Version **v0.1.0** marks the readiness of the first stable production release of the
**Design Studio** platform — a standalone SaaS storefront for print-on-demand designers with
automatic catalog synchronization from Redbubble, dual database support (Supabase / MySQL),
and a complete set of technical documentation.

---

## 2. Key Release Features (Scope & Changelog)

### New capabilities (Features)
- **Redbubble synchronization pipeline (Playwright + Cheerio)**:
  - Standalone product import via CLI (`npm run sync:redbubble`) and HTTP API
    (`/api/sync/redbubble`).
  - Smart anti-detection: Cloudflare challenge handling, adaptive jitter (`RequestPacer`),
    session cookie persistence in `.cache/redbubble-storage-state.json`.
  - Extraction of Schema.org microdata (`Product`) and OpenGraph meta tags.
- **Dual database support (Dual DB Provider)**:
  - Transparent database provider switching via `DATABASE_PROVIDER` (`supabase` or `mysql`).
  - A single facade of fetch methods (`getSiteConfig`, `fetchDesigns`, `getDesignById`,
    `fetchCollections`).
  - SQL schemas and procedures for PostgreSQL and MySQL.
- **UI and storefront on Next.js 16 + React 19**:
  - Responsive catalog with search, collection filtering, and pagination.
  - Detailed product cards with links to external marketplaces (`ShopLinks`) and social sharing
    (`ShareLinks`).
  - Hero carousel and a featured-designs block.
  - A safe cookie banner (`CookieBanner`) built on `useSyncExternalStore`.
  - Dynamic sitemap (`/sitemap.xml`) and OpenGraph metadata.
- **Complete technical documentation (`docs/`)**:
  - `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SYNC_SYSTEM.md`,
    `docs/FRONTEND_AND_UI.md`, `docs/DEPLOYMENT_AND_CONFIGURATION.md`, `docs/README.md`.

---

## 3. Release Readiness Checklist

| Stage | Task | Status | Note |
|---|---|:---:|---|
| **Code and tests** | Run Vitest unit tests (`npm test`) | ✅ Passed | 12/12 tests passed successfully |
| **Build** | Production build check (`npm run build`) | ✅ Passed | Successful Turbopack compilation (11/11 pages) |
| **Linting** | ESLint 9 check (`npm run lint`) | ✅ Done | Flat config set up in `eslint.config.mjs` |
| **Documentation** | Deployment instructions available | ✅ Passed | Vercel, Docker, and MySQL covered |
| **Security** | Secrets check in code | ✅ Passed | Passwords and API keys only in `.env` / `.env.example` |
| **Versioning** | Pin the `v0.1.0` release tag in Git | ⏳ To do | Create an annotated tag |

---

## 4. Step-by-Step Rollout Plan

### Step 1: Environment preparation (pre-flight)
1. Make sure the DDL scripts have been applied to the database (Supabase or MySQL):
   - Supabase: `init/postgres_tables.sql` and `init/postgres_functions.sql`.
   - MySQL: `init/mysql_tables.sql` and `init/mysql_functions.sql`.
2. Populate the basic brand parameters in the `studio` table (or rely on `config/config.json`).
3. Configure the environment variables in the Vercel / hosting panel:
   - `DATABASE_PROVIDER`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`.
   - `SYNC_SECRET` (an arbitrary strong string protecting the API cron jobs).
   - `REDBUBBLE_SHOP_URL` (the shop URL).

### Step 2: Initial catalog synchronization
- Run the initial product import command:
  ```bash
  npm run sync:redbubble
  ```
- Verify that records appeared in the `designs` table.

### Step 3: Deploying the application
- Connect the repository to Vercel.
- The catalog sync is **not** scheduled on Vercel — Cloudflare blocks both Cheerio and headless
  Playwright there. Instead, run `npm run sync:redbubble` with `SYNC_PLAYWRIGHT_HEADLESS=false` on
  a machine/VM with a display, scheduled via the OS scheduler (Windows Task Scheduler / cron); see
  `docs/DEPLOYMENT_AND_CONFIGURATION.md`.

### Step 4: Post-release validation (smoke testing)
- [ ] Check the home page `/` (hero, carousel, featured designs).
- [ ] Check the catalog `/designs`: title search, collection filter, pagination.
- [ ] Check a product card `/designs/[slug]`: purchase and sharing links work.
- [ ] Check the dynamic `/sitemap.xml`.
- [ ] Check that `/api/sync/redbubble` responds when the secret header `x-sync-secret` is passed.

---

## 5. Rollback Strategy
- Frontend failures: instant rollback to the previous deployment in the Vercel dashboard.
- Synchronization failures: pause the scheduled task, or manually refresh the `storageState`
  session (Cloudflare blocks both Cheerio and headless Playwright, so `SYNC_USE_PLAYWRIGHT=false`
  is not a working fallback).
- Database: the schema contains no destructive migrations; rolling data back is enough to clear
  the `designs` table.
