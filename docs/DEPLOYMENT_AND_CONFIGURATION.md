# Deployment, Configuration and Operations

## 1. Environment Variable Reference

All environment settings are configured in the `.env` file (see `.env.example` in the repository root for the full template).

### 1.1 Database variables (Supabase / PostgreSQL)
| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_PROVIDER` | No | `supabase` | Database engine selector: `supabase` or `mysql`. Any other value throws `Unsupported DATABASE_PROVIDER` at runtime. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (Supabase) | — | Supabase project URL (e.g. `https://xyzproject.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (Supabase) | — | Public anonymous Supabase key for client-side and read operations. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (for sync) | — | Secret service key that bypasses RLS; required for writing/upserting scraped data (the init schema enables RLS with public read-only policies). |

### 1.2 Database variables (MySQL)
| Variable | Required | Default | Description |
|---|---|---|---|
| `MYSQL_HOST` | Yes (MySQL) | — | MySQL server host (e.g. `127.0.0.1` or `db.production.internal`). |
| `MYSQL_PORT` | No | `3306` | MySQL connection port. |
| `MYSQL_USER` | Yes (MySQL) | — | Database user name. |
| `MYSQL_PASSWORD` | Yes (MySQL) | — | User password. |
| `MYSQL_DATABASE` | Yes (MySQL) | — | Project database name. |

### 1.3 Synchronization subsystem variables
| Variable | Required | Default | Description |
|---|---|---|---|
| `SYNC_SECRET` | Yes (for API) | — | Secret token authorizing calls to `/api/sync/redbubble` and `/api/revalidate/config` (sent via the `Authorization: Bearer` or `x-sync-secret` header). |
| `REDBUBBLE_SHOP_URL` | Yes | — | Shop URL (e.g. `https://www.redbubble.com/people/yourname/shop`); used only if the `studio` table does not define `representation.redbubbleShopUrl`. |
| `SYNC_MAX_PAGES` | No | `5` | Maximum number of catalog pages to scan. |
| `SYNC_PAGE_DELAY_MS` | No | `3000` | Pause (ms) between shop listing pages. |
| `SYNC_MIN_REQUEST_INTERVAL_MS` | No | `2500` | Minimum interval between consecutive network requests. |
| `SYNC_REQUEST_JITTER_MS` | No | `700` | Maximum randomized jitter added to request delays. |
| `SYNC_CONCURRENCY` | No | `1` | Concurrency of Cheerio-mode product-page parsing. |
| `SYNC_USE_PLAYWRIGHT` | No | `true` | Use the Chromium browser for scraping (`true`) or Cheerio (`false`). |
| `SYNC_PLAYWRIGHT_HEADLESS` | No | `true` | Run Chromium in the background (`false` to solve a CAPTCHA manually). |
| `SYNC_PLAYWRIGHT_STORAGE_STATE_PATH` | No | unset (`.env.example`: `.cache/redbubble-storage-state.json`) | Path to the persisted session file (cookies, localStorage). When unset, no storage state is saved or loaded. |
| `REDBUBBLE_USER_AGENT` | No | — | Custom real-browser User-Agent sent with sync requests. |
| `REDBUBBLE_COOKIE` | No | — | Cookie string from a real browser session (to bypass Cloudflare in Cheerio mode). |

### 1.4 Public prints API variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PRINTS_API_ALLOWED_ORIGINS` | No | `*` (any origin) | Comma-separated list of exact origins (scheme+host+port) allowed to call `/api/v1/*` from a browser via CORS, or `*` for any origin. Set a list to restrict access. See [docs/PUBLIC_API.md](./PUBLIC_API.md) for details. Requires a redeploy/restart to take effect. |

### 1.5 Site config cache & Supabase webhook

`getSiteConfig()` (`utils/database.ts`) is cached across requests with the Next.js Data Cache under the tag `site-config` and a 5-minute (`revalidate: 300`) safety TTL, on top of the existing per-render React `cache()` dedupe. Edits to the `studio` table are picked up within 5 minutes automatically, or immediately by calling `POST /api/revalidate/config` (authorized the same way as the sync endpoint, via `SYNC_SECRET`).

To invalidate on every edit, configure a Supabase Database Webhook:

1. Supabase Dashboard → **Database** → **Webhooks** → **Create a new hook**.
2. Table: `public.studio`. Events: `INSERT`, `UPDATE`, `DELETE`.
3. Type: **HTTP Request**, Method: `POST`, URL: `https://<your-domain>/api/revalidate/config`.
4. Headers: `Authorization: Bearer <SYNC_SECRET>`.

Manual invalidation:

```bash
curl -fsS -X POST "https://your-domain.com/api/revalidate/config" -H "Authorization: Bearer YOUR_LONG_RANDOM_SYNC_SECRET"
```

---

## 2. Deploying on Vercel

Vercel is the recommended platform for hosting the web application thanks to native Next.js 16 support and a built-in Cron Jobs scheduler.

### 2.1 Deployment steps

1. Push the repository to GitHub / GitLab / Bitbucket.
2. In the [Vercel dashboard](https://vercel.com), click **Add New... -> Project** and import the repository.
3. In the **Environment Variables** block, add all required variables:
   - `DATABASE_PROVIDER=supabase`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SYNC_SECRET`
   - `REDBUBBLE_SHOP_URL`
   - `SYNC_USE_PLAYWRIGHT=false` *(critical for Vercel Serverless Functions)*
4. Click **Deploy**.

### 2.2 Scheduling automatic synchronization

The repository does **not** include a `vercel.json` — adding one at the project root is part of deployment. A cron entry looks like this:

```json
{
  "crons": [
    {
      "path": "/api/sync/redbubble",
      "schedule": "0 4 * * *"
    }
  ]
}
```

*The `0 4 * * *` schedule means daily at 04:00 UTC.*

> **IMPORTANT — check these caveats against the current code before using Vercel Cron**:
> 1. Vercel Cron jobs issue **GET** requests, while the sync route currently exports a **POST-only** handler; a cron call would be answered with `405 Method Not Allowed`. Using Vercel Cron therefore requires extending `app/api/sync/redbubble/route.ts` with an authenticated `GET` handler.
> 2. The route authenticates via request **headers** only (`Authorization: Bearer ...` or `x-sync-secret`, compared in constant time); the `?secret=...` query parameter is **not** accepted. Secrets cannot be injected from environment variables into `vercel.json`, so any header value would have to be hardcoded in a committed file — avoid this.
>
> The scheduling method that works with the code as-is is an external scheduler that sends a POST with the secret header — e.g. a system crontab on any host, cron-job.org, GitHub Actions, or n8n:
> ```bash
> 0 4 * * * curl -fsS -X POST "https://your-domain.com/api/sync/redbubble" -H "x-sync-secret: YOUR_LONG_RANDOM_SYNC_SECRET" >/dev/null
> ```

> **ALSO IMPORTANT**: in the Vercel Serverless Functions environment the Chromium binary bundle exceeds the standard serverless function size limit, so on Vercel the `/api/sync/redbubble` endpoint must run in Cheerio mode (`SYNC_USE_PLAYWRIGHT=false`). For Playwright-based sync, use the dedicated runner described in section 3.

---

## 3. Deploying a Permanent Playwright Sync Runner (Docker / VM)

If Redbubble blocks direct Cheerio HTTP requests, move the sync process to a dedicated container or virtual machine (DigitalOcean, Hetzner, AWS EC2) running a full headless Chromium browser.

### 3.1 Dockerfile for a standalone synchronizer

Create a `Dockerfile.sync` in the repository root (the file is not part of the repository):

```dockerfile
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install project dependencies and Playwright binaries
RUN npm ci
RUN npx playwright install chromium --with-deps

# Copy the source code
COPY . .

# Create the session cache directory
RUN mkdir -p .cache

# Default sync start command
CMD ["npm", "run", "sync:redbubble"]
```

The base image tag (`v1.52.0`) matches the `playwright` version pinned in `package.json` (`^1.52.0`) — keep them in sync when upgrading.

### 3.2 Running via Docker Compose with a cron scheduler

Example `docker-compose.yml`:
```yaml
version: '3.8'

services:
  redbubble-sync:
    build:
      context: .
      dockerfile: Dockerfile.sync
    environment:
      - DATABASE_PROVIDER=supabase
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - REDBUBBLE_SHOP_URL=${REDBUBBLE_SHOP_URL}
      - SYNC_USE_PLAYWRIGHT=true
      - SYNC_PLAYWRIGHT_HEADLESS=true
      - SYNC_PLAYWRIGHT_STORAGE_STATE_PATH=/app/.cache/session.json
    volumes:
      - ./sync-cache:/app/.cache
    restart: "no"
```

To run once per day, add an entry to the server's system crontab (`crontab -e`):
```bash
0 3 * * * cd /opt/design-studio && docker compose run --rm redbubble-sync
```

---

## 4. Troubleshooting

### 4.1 Error: `Redbubble blocked automated access with Cloudflare challenge`

- **Cause**: Cloudflare protection flagged suspicious activity from your IP or default bot headers. The full messages differ per mode:
  - Cheerio: *"Redbubble blocked automated access with Cloudflare challenge. Set REDBUBBLE_COOKIE and REDBUBBLE_USER_AGENT from a real browser session."*
  - Playwright: *"Redbubble blocked browser automation with Cloudflare challenge. Run once with SYNC_PLAYWRIGHT_HEADLESS=false and complete challenge, then reuse SYNC_PLAYWRIGHT_STORAGE_STATE_PATH."*
- **Solution**:
  1. Run the sync script locally with a visible browser window:
     ```bash
     SYNC_PLAYWRIGHT_HEADLESS=false SYNC_PLAYWRIGHT_STORAGE_STATE_PATH=.cache/session.json npm run sync:redbubble
     ```
  2. When the Cloudflare window appears ("Just a moment" / "Verify you are human"), complete the check manually.
  3. After a successful pass, the session file `.cache/session.json` stores the valid `cf_clearance` cookies.
  4. Copy this file to the production server, or use its values in the `REDBUBBLE_COOKIE` variable.

### 4.2 Error: `Missing Supabase environment variables` or `new row violates row-level security policy`

- **Cause**:
  - `SUPABASE_SERVICE_ROLE_KEY` is not set, so the client falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - The init schema (`init/postgres_tables.sql`) enables RLS on `studio` and `designs` with public read-only policies, so INSERT/UPDATE with the anon key violates the policy.
- **Solution**: set `SUPABASE_SERVICE_ROLE_KEY` in `.env`. The service key carries elevated privileges and bypasses RLS (never expose it to the client).

### 4.3 Error: `Too many connections` in MySQL

- **Cause**: frequent serverless function restarts create many independent `mysql.createPool` instances.
- **Solution**:
  - The pool in `utils/database.ts` is already capped (`waitForConnections: true`, `connectionLimit: 10`, `queueLimit: 0`, `dateStrings: true`, and TLS with `rejectUnauthorized: true` in production); the pool is cached on `globalThis` and can be torn down with `closeDatabaseConnections()`:
    ```typescript
    globalForMySQL.mysqlPool = mysql.createPool({
        host: MYSQL_HOST,
        port: MYSQL_PORT ? Number(MYSQL_PORT) : 3306,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        database: MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        dateStrings: true,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
    });
    ```
  - Under heavy load, use a connection-pooling proxy such as **ProxySQL** or **AWS RDS Proxy**.
