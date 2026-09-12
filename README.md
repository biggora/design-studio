This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment Variables

Copy `.env.example` to `.env` and fill in your settings.

`DATABASE_PROVIDER` determines which database is used:

- `supabase` (default) – requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `mysql` – requires `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` and `MYSQL_DATABASE`.


## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Running Tests

This project uses [Vitest](https://vitest.dev/) for unit testing.
To execute the tests run:

```bash
npm test
```

During development you can use watch mode:

```bash
npm run test:watch
```

## Database Setup

The `init/` directory contains SQL scripts for PostgreSQL and MySQL.

### PostgreSQL

```bash
psql -f init/tables.sql
psql -f init/functions.sql
```

### MySQL

```bash
mysql -u <user> -p <database> < init/mysql_tables.sql
mysql -u <user> -p <database> < init/mysql_functions.sql
```

## Redbubble Sync

The catalog is populated by syncing your public Redbubble shop pages into the `designs` table.

### Required config

- `representation.redbubbleShopUrl` in `config/config.json` (or in the `studio` table via config).
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
- `REDBUBBLE_USER_AGENT` and `REDBUBBLE_COOKIE` (recommended if Redbubble returns Cloudflare challenge / 403)

Notes:
- Browser mode may still need one manual challenge pass. Run once with `SYNC_PLAYWRIGHT_HEADLESS=false`, complete the challenge, and keep the storage state file for scheduled runs.
- Serverless environments may not support persistent browser storage; prefer running sync script on a machine/VM for stable Playwright sessions.

### Manual sync

```bash
npm run sync:redbubble
```

### Scheduled sync (Vercel Cron)

`vercel.json` defines a daily cron calling `/api/sync/redbubble`. Replace `YOUR_SYNC_SECRET` in the path with your real value, or send `x-sync-secret` in another scheduler.
