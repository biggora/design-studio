# Design Studio

A self-hostable, **white-label storefront for print-on-demand artists**. Each deployment automatically mirrors the artist's marketplace shop (Redbubble today) into a fast, searchable catalog on their own domain and funnels buyers to the marketplace listing to purchase — there is no on-site checkout. Brand, domain, social links, and even the color theme are runtime configuration, not code. See [PRODUCT.md](PRODUCT.md) for the product brief and [DESIGN.md](DESIGN.md) for the design system of record.

## Tech Stack

- **Next.js** `^16.3.6` (App Router, React Server Components) with **React** `^19.2.4`
- **Tailwind CSS** `^3.4.1` driven by a design-token layer (`:root` CSS custom properties in `app/globals.css`) and `components/ui` primitives (shadcn convention, no Radix)
- **Zustand** `^5.0.2` for client config state
- **Supabase** (`@supabase/supabase-js` `^2.47.1`, PostgreSQL — default) or **MySQL** (`mysql2` `^3.11.0`) via the `utils/database.ts` facade
- **Playwright** `^1.52.0` / **Cheerio** `^1.0.0-rc.12` for catalog sync, **Vitest** `^3.2.4` for tests

## Getting Started

```bash
npm install
npx playwright install chromium   # only needed for catalog sync
cp .env.example .env              # then fill in your settings
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser. The app uses `next/font` to self-host **Inter** (no external font requests). Useful scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run prettier`.

## Environment Variables

Copy `.env.example` to `.env` and fill in your settings.

`DATABASE_PROVIDER` determines which database is used:

- `supabase` (default) – requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (writes prefer `SUPABASE_SERVICE_ROLE_KEY`).
- `mysql` – requires `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` and `MYSQL_DATABASE`.

Sync-related variables (`SYNC_SECRET`, `SYNC_MAX_PAGES`, `REDBUBBLE_SHOP_URL`, …) are listed in the [Redbubble Sync](#redbubble-sync) section below; the full reference is in [docs/DEPLOYMENT_AND_CONFIGURATION.md](docs/DEPLOYMENT_AND_CONFIGURATION.md).

## Running Tests

This project uses [Vitest](https://vitest.dev/) for unit testing. `lib/utils.test.ts` holds 18 tests (a gitignored worktree copy under `.claude/worktrees/` may double the reported count in some runs).

```bash
npm test          # one-shot run
npm run test:watch  # watch mode during development
```

## Database Setup

The `init/` directory contains SQL scripts for PostgreSQL and MySQL.

### PostgreSQL (Supabase)

```bash
psql -f init/postgres_tables.sql
psql -f init/postgres_functions.sql
```

### MySQL

```bash
mysql -u <user> -p <database> < init/mysql_tables.sql
mysql -u <user> -p <database> < init/mysql_functions.sql
```

Schemas and migration notes are documented in [docs/DATABASE.md](docs/DATABASE.md).

## Redbubble Sync

The catalog is populated by syncing your public Redbubble shop pages into the `designs` table.

### Required config

- `representation.redbubbleShopUrl` in `config/config.json` (or in the `studio` table via config). The runner falls back to `config.representation.redbuble`, then to the `REDBUBBLE_SHOP_URL` env var.
- `SYNC_SECRET` in `.env` (used by the API route).
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (preferred) or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Optional:

- `SYNC_MAX_PAGES` (default `5`)
- `SYNC_PAGE_DELAY_MS` (default `3000`)
- `SYNC_MIN_REQUEST_INTERVAL_MS` (default `2500`)
- `SYNC_REQUEST_JITTER_MS` (default `700`)
- `SYNC_CONCURRENCY` (default `1`)
- `SYNC_USE_PLAYWRIGHT` (default `true`)
- `SYNC_PLAYWRIGHT_HEADLESS` (default `true`)
- `SYNC_PLAYWRIGHT_STORAGE_STATE_PATH` (default `.cache/redbubble-storage-state.json`)
- `REDBUBBLE_USER_AGENT` and `REDBUBBLE_COOKIE` (recommended if Redbubble returns a Cloudflare challenge / 403)

Notes:
- Browser mode may still need one manual challenge pass. Run once with `SYNC_PLAYWRIGHT_HEADLESS=false`, complete the challenge, and keep the storage state file for scheduled runs.
- Serverless environments may not support persistent browser storage; prefer running sync script on a machine/VM for stable Playwright sessions.

### Manual sync

```bash
npm run sync:redbubble
```

### Scheduled sync

The sync cannot run on Vercel — Cloudflare blocks both Cheerio and headless Playwright there. Schedule `npm run sync:redbubble` with `SYNC_PLAYWRIGHT_HEADLESS=false` via the OS scheduler (Windows Task Scheduler / cron) on a machine/VM with a display; `POST /api/sync/redbubble` (authenticated via the `x-sync-secret` header) remains available as an optional manual trigger from that machine. See [docs/DEPLOYMENT_AND_CONFIGURATION.md](docs/DEPLOYMENT_AND_CONFIGURATION.md) for scheduler recipes and the Docker-based Playwright runner.

## Documentation

The full technical documentation set lives in [docs/](docs/):

- [docs/README.md](docs/README.md) — documentation portal and developer quick start
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system architecture
- [docs/DATABASE.md](docs/DATABASE.md) — database schemas and procedures
- [docs/SYNC_SYSTEM.md](docs/SYNC_SYSTEM.md) — the Redbubble sync pipeline
- [docs/FRONTEND_AND_UI.md](docs/FRONTEND_AND_UI.md) — frontend, UI components, and the design-token system
- [docs/DEPLOYMENT_AND_CONFIGURATION.md](docs/DEPLOYMENT_AND_CONFIGURATION.md) — deployment and configuration guide
- [docs/PUBLIC_API.md](docs/PUBLIC_API.md) — public, unauthenticated read-only prints API
- [docs/RELEASE_PLAN.md](docs/RELEASE_PLAN.md) — release plan

Root-level references: [PRODUCT.md](PRODUCT.md) (product truth) and [DESIGN.md](DESIGN.md) (design system of record — token names, the No-Hardcode Rule, component contracts).
