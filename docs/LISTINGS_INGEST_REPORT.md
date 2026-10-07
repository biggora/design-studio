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
