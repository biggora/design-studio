# Listings ingest implementation report

Implemented authenticated POST and GET `/api/v1/listings`, transactional ingest for Supabase/PostgreSQL and MySQL, scraper identity protection, and additive public listing links. No live marketplaces were scraped and no production database was read or written for verification. Production migrations have not been applied.

Changed files (relative to the repository root):

- Schema: `init/migrations/003_design_listings_postgres.sql`, `003_design_listings_mysql.sql`, `init/postgres_tables.sql`, `postgres_functions.sql`, `mysql_tables.sql`.
- Ingest/auth: `app/api/v1/listings/route.ts`, `route.test.ts`, `lib/listings.ts`, `lib/sync-auth.ts`, `.env.example`.
- Database facade: `utils/database.ts`, `utils/listings-database.ts`, `utils/listings-database.test.ts`.
- Scrapers: `lib/sync/redbubble.ts`, `redbubble.test.ts`, `teepublic.ts`, `teepublic.test.ts`.
- Public API: `app/api/v1/prints/route.ts`, `random/route.ts`, `[id]/route.ts`, `route.test.ts`, `lib/public-api.ts`, `public-api.test.ts`.
- Nullable Redbubble support: `types/design.ts`, `lib/slug.ts`, `slug.test.ts`, `scripts/backfill-design-slugs.ts`, `app/designs/[slug]/page.tsx`, `page.test.tsx`.
- Documentation: `docs/DATABASE.md`, `docs/PUBLIC_API.md`, `docs/SYNC_SYSTEM.md`, this report.

The request contract is `{ design: { sourceImageId, sha256, title, description?, tags?, backgroundColor? }, listing: { platform, account, externalId, url, title?, description?, tags?, thumbnailUrl?, publishedAt?, extra? } }`. Both objects and the root reject unknown fields. See [PUBLIC_API.md](PUBLIC_API.md#ingest-api) for all validation limits, exact response examples, and curl commands.

POST returns `{ design: { id, slug, title, externalId, sha256, sourceImageId }, listing: { id, platform, account, externalId, url, title, tags, thumbnailUrl, publishedAt, extra }, created: { design, listing } }`. A newly recorded listing returns 201; a repeated listing returns 200. GET accepts exactly one `sha256` or `sourceImageId` parameter and returns `{ design, listings }` or 404. Errors preserve the existing `{ error: string }` shape with additive `code`, optional `field`, and optional `details`: 400 VALIDATION, 401 UNAUTHORIZED, 404 NOT_FOUND, 409 CONFLICT, 503 NOT_CONFIGURED, 500 INTERNAL. Responses are never cached.

Designs without Redbubble have a NULL database externalId and normalized empty legacy link/image strings. They remain in catalog, random, detail, and sitemap reads; the public API returns `link: ""` plus other marketplace links. Detail pages hide the Redbubble button and show the existing placeholder. New slugs use the shared helper and source image ID; legacy null-ID slug backfills use the UUID. Existing slugs, including NULL on adopted legacy rows, remain unchanged. Listing thumbnails stay in listing metadata rather than being copied into curated artwork or expanding image host configuration.

Verification passed:

- Full repository Vitest suite: **380 tests, 17 files**, including **27 real PostgreSQL/MySQL transaction tests**, with stale `.claude/worktrees` excluded. Command: `LISTINGS_TEST_DATABASES=1 npm test -- --exclude '**/.claude/**'` (PowerShell sets that variable separately).
- Typecheck: `npx tsc --noEmit`.
- Lint: `npm run lint -- --ignore-pattern '.claude/**' --ignore-pattern '.agents/**'`. The unfiltered command encounters unrelated generated files and duplicate code in pre-existing worktrees/installed skills; those directories were left intact.
- PostgreSQL migration applied twice successfully; both providers' migrations upgraded pre-ingest schemas. Fresh table scripts and PostgreSQL function scripts also executed successfully in disposable local databases.
- Actual Next.js HTTP smoke check with local MySQL: POST 201, repeat 200, authenticated GET 200, public prints 200 with listing projection, and a TeePublic-only detail page 200 with placeholder and no Redbubble button.
- `git diff --check`.

Implementation decisions beyond the listed limits: source IDs and Redbubble IDs must fit JavaScript safe integers because existing database readers return numbers; `extra.mockupTshirt` must use an allowed HTTPS Redbubble image host to keep Next/Image rendering valid; conflicting replacements of an existing source identity return 409 instead of silently retaining mismatched identities. PostgreSQL schema line endings were normalized to the repository's LF rule while updating the schema. The permitted existing API string error envelope was retained. Omitted listing fields retain their previous values on repeat requests, including publishedAt; API-protected designs are conservatively skipped by scrapers rather than having null fields backfilled.

Before deployment, apply migration 003 for the selected database (after 002), set **LISTINGS_API_TOKEN**, and keep the existing Supabase service-role key or MySQL server credentials configured. The client's base URL is the deployment origin; local development normally uses **http://localhost:3000**, with POST/GET at **/api/v1/listings**. Successful ingests call the existing `revalidatePath("/", "layout")` mechanism. External CDN caches for public JSON responses retain their existing five-minute cache policy.

## Social posts ingest

Implemented an authenticated API for recording social-media posts of existing designs: `POST /api/v1/social-posts` (create or update), `GET /api/v1/social-posts` (filtered, paginated list) and `GET /api/v1/social-posts/summary` (counts per channel, account and status). Only final facts are stored (`published` or `removed`). The API never creates designs; the design must already exist through `/api/v1/listings`. It reuses `LISTINGS_API_TOKEN` and the listings error envelope. Transactional ingest works on Supabase/PostgreSQL and MySQL. No live social network was contacted, and no production database was read or written. Production migrations have not been applied.

Changed files (relative to the repository root):

- Schema: `init/migrations/004_design_social_posts_postgres.sql`, `004_design_social_posts_mysql.sql`, `init/postgres_tables.sql`, `init/postgres_functions.sql`, `init/mysql_tables.sql`.
- Validation and types: `lib/social-posts.ts`, `lib/social-posts.test.ts`; `lib/listings.ts` (now exports the shared helpers `invalid`, `strictObject`, `text`, `httpUrl` and `isoTimestamp`; no behavior change).
- Routes: `app/api/v1/social-posts/route.ts`, `route.test.ts`, `summary/route.ts`.
- Database facade: `utils/database.ts` (`upsertSocialPost`, `listSocialPosts`, `summarizeSocialPosts`, error mapping), `utils/social-posts-database.ts` (MySQL implementation), `utils/social-posts-database.test.ts`.
- Migration runner test: `scripts/migrate.test.ts` (expects 004 in the recorded history).
- Documentation: `docs/DATABASE.md` (§2.7), `docs/PUBLIC_API.md` ("Social posts ingest"), this report.

Request and response shapes (full limits, domain table and examples are in [PUBLIC_API.md](PUBLIC_API.md#social-posts-ingest)):

- POST body: `{ design: { sha256?, sourceImageId? }, post: { channel, account, variant, externalId, url, status, publishedAt, removedAt?, linkUrl?, title?, caption?, hashtags?, imageUrl?, board?, extra? } }`. The root and both objects reject unknown fields. At least one design identity is required.
- POST response: `{ design: { id, slug, title, sha256, sourceImageId }, post: { id, designId, channel, account, variant, externalId, url, linkUrl, title, caption, hashtags, imageUrl, board, status, publishedAt, removedAt, extra, createdAt, updatedAt }, created: boolean }`. Optional values that are unset are `null`; timestamps are UTC ISO strings with milliseconds.
- POST status codes: 201 new post, 200 repeat of `(channel, externalId)`.
- GET list response: `{ data: [{ post, design: { id, slug, title } }], pagination: { page, limit, total } }`, ordered by `publishedAt` then `id`, both descending. Defaults: page 1, limit 50, maximum 200.
- GET summary response: `{ data: [{ channel, account, status, count }] }`.
- Errors: `{ error, code, field?, details? }` with 400 VALIDATION, 401 UNAUTHORIZED, 404 NOT_FOUND (unknown design on POST), 409 CONFLICT, 503 NOT_CONFIGURED, 500 INTERNAL. Responses are never cached.

Decisions and assumptions:

- PostgreSQL uses three RPC functions (`upsert_design_social_post`, `list_design_social_posts`, `summarize_design_social_posts`) because supabase-js cannot run a multi-statement transaction. They are `SECURITY INVOKER` and executable only by `service_role`. MySQL runs the same logic in a `SERIALIZABLE` transaction with `FOR UPDATE` locks.
- Concurrency: on PostgreSQL, same-post requests serialize on an advisory lock over `(channel, externalId)`, and the design row is locked with `FOR UPDATE`. A unique-index collision or MySQL deadlock is reported as 409, so the client can retry.
- Post identity is `(channel, externalId)`. A design may have only one post per `(channel, account, variant)`.
- A repeat overwrites the required fields and keeps omitted optional fields. `removed` to `published` is a 409, and a post is never moved to another design.
- `removedAt` is required with `removed` and rejected with `published`, so the stored row never has `status = removed` without a time (also enforced by a CHECK constraint).
- `hashtags` and `extra` are stored as JSON (`JSONB` on PostgreSQL, `JSON` on MySQL). `extra` is limited to 16 KiB.
- Channel domain rules reject URLs that do not belong to the channel. Pinterest accepts country domains (`pinterest.de`, `pinterest.co.uk`, `pinterest.com.au`) but not look-alikes such as `pinterest.evil.com`. Mastodon has no domain check because instances are self-hosted.
- Duplicate and unknown query parameters are rejected with 400 rather than silently using the first or last value. `since` and `until` filter on `publishedAt`, inclusive.
- The summary endpoint is included because it is a single `GROUP BY` query.
- No `revalidatePath`: social posts are private and do not appear on any rendered page.
- `design_social_posts` has RLS enabled and no `anon` or `authenticated` access; only the service role can read or write it.

Verification results:

- Full repository Vitest suite: **441 passed, 90 skipped** without databases (`npx vitest run --exclude "**/.claude/**"`); **521 passed, 10 skipped** with `LISTINGS_TEST_DATABASES=1`. The 10 skipped are `scripts/migrate.test.ts`, which needs `MIGRATIONS_TEST_DATABASES=1` (run separately: 10/10 passed).
- Real PostgreSQL/MySQL transaction tests (`LISTINGS_TEST_DATABASES=1`): **53 social-posts tests** (26 per provider plus the Postgres-only RLS test) and the 27 listings tests passed on disposable PostgreSQL 17 and MySQL 8.4 containers, including parallel-upsert, rollback, cascade and grant checks.
- Typecheck (`npx tsc --noEmit`): passed (exit 0).
- Lint: `npm run lint -- --ignore-pattern '.claude/**' --ignore-pattern '.agents/**'` passed with no findings.

Deployment steps:

1. Apply migration 004 for the selected provider, after 003: run `npm run db:migrate`, or apply `init/migrations/004_design_social_posts_postgres.sql` (Supabase SQL editor or `psql`) or `004_design_social_posts_mysql.sql` (`mysql` client) by hand. Both scripts are rerunnable. Fresh installs use the full table and function scripts.
2. No new environment variables. `LISTINGS_API_TOKEN` is already required; Supabase also needs the existing `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy, then call `GET /api/v1/social-posts/summary` with the bearer token as a smoke check.
