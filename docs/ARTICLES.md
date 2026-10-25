# Tumblr article announcements

`/articles` is a server-rendered index of short English announcements linking to full
Tumblr articles. It uses the original reviewed Facebook covers, hosted on the existing
image CDN. The index joins the header, footer and (when nonempty) sitemap. Empty indexes
are `noindex`; pages contain twelve cards with page-specific canonicals.
The header and footer call the section **Oddly Useful**, configured through `articles.label`
in the JSON defaults or the corresponding `studio` row. The route remains `/articles`.

## Setup

1. Apply `012_articles` for the configured database provider. Fresh-install table scripts
   include the same table. PostgreSQL enables RLS, revokes anonymous/authenticated grants,
   and grants only the server `service_role` access. MySQL uses its server connection.
2. Set server-only `TUMBLR_API_KEY` to the existing Tumblr application's consumer key.
   No Tumblr OAuth token or secret is needed on the website.
3. Set `NEXT_PUBLIC_IMAGES_CDN` to the existing public CDN base URL. Covers are restricted
   to its `/articles/` namespace and immutable hash-bearing paths.
4. Configure pod-video as described in its `docs/social/website.md`, run the dry-run,
   then `npm run blog -- website sync`.

## Ingest

Authenticated `PUT /api/articles` accepts one JSON object:

```json
{
  "sourceArticleId": "blg_stable_id",
  "blog": "your-shop.tumblr.com",
  "tumblrPostId": "831330512661610496",
  "tumblrUrl": "https://your-shop.tumblr.com/post/831330512661610496/article-slug",
  "title": "Article title",
  "excerpt": "Short introduction without Facebook hashtags or CTA.",
  "imageUrl": "https://your-cdn.example/articles/blg_stable_id/<sha256>.png",
  "imageSha256": "<64 lowercase hexadecimal characters>",
  "imageAlt": "Description of the actual Facebook cover"
}
```

Use `Authorization: Bearer <SYNC_SECRET>` or `x-sync-secret`. Success is
`{"sourceArticleId":"blg_stable_id","saved":true}`. Unauthenticated requests return
401; invalid input returns 400. No public source-data GET endpoint exists.
Identity is `(blog, sourceArticleId)`, independent of Tumblr ID changes. Repeated PUTs
upsert one row. Content revisions reset verification freshness while preserving the last
verified public snapshot; compare-and-set writes prevent stale checks overwriting a newer revision.

## Publication gate and outages

All database access goes through `utils/database.ts`. Public rendering checks only the
Tumblr **public posts** API with API-key authentication. The expected ID is tried first;
if absent, all public pages are searched for exactly one matching registered slug.
IDs stay strings. Ambiguous matches, drafts, queued and private posts remain hidden.
The canonical URL and date come from the actual published post.

Verification timestamps and the last successful public snapshots persist in the database,
so they survive serverless restarts. Requests after five minutes recheck publication.
A confirmed absence removes a card. A transient response/schema/auth/network failure
preserves the last verified cards and never opens a previously hidden card; another check
is attempted after five minutes. A failure in any part of a verification batch preserves
that entire batch. There is no cron, webhook, or always-on local process.

The registration and rendering of website announcements never create or reschedule Tumblr
or Facebook posts. Publishing the code/deployment is a separate repository operation.

## Database integration tests

Use disposable databases, never production credentials:

```powershell
docker compose -p design-studio-articles -f tests/articles/compose.yml up -d --wait
$env:ARTICLES_TEST_DATABASES='1'
npx vitest run utils/articles-database.integration.test.ts
docker compose -p design-studio-articles -f tests/articles/compose.yml down -v
```

The tests always use the named PostgreSQL container and localhost MySQL with development
credentials. MySQL defaults to port 33327; set `ARTICLES_MYSQL_PORT` before both Compose
and Vitest to use another port. PostgreSQL needs no published host port. The opt-in flag
keeps ordinary unit tests independent of Docker.
