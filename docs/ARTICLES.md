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
   This integration is optional: with an absent, empty or whitespace-only key, verification
   and scheduled processing are disabled. No Tumblr requests or verification writes run.
   Existing verified cards retain their normal status/time gates; new and scheduled cards
   remain hidden. The build does not require this key.
3. Set `NEXT_PUBLIC_IMAGES_CDN` to the existing public CDN base URL. Covers are restricted
   to its `/articles/` namespace and immutable hash-bearing paths.
4. Apply `015_article_schedules_postgres.sql` or `015_article_schedules_mysql.sql` after
   the existing migrations. Never change migration 012 on an existing installation.
5. Configure pod-video as described in its `docs/social/website.md`, run the dry-run,
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
401; invalid input returns 400. No unauthenticated source-data GET endpoint exists.
Identity is `(blog, sourceArticleId)`, independent of Tumblr ID changes. Repeated PUTs
upsert one row. Content revisions reset verification freshness while preserving the last
verified public snapshot; compare-and-set writes prevent stale checks overwriting a newer revision.

## Website publication schedules

The schedule controls **when the announcement appears on this website**. It does not
schedule, publish, edit or move the Tumblr article, Facebook announcement or X post.
Keep the article's usual Tumblr workflow separate.

All endpoints below require the existing `SYNC_SECRET`, using either
`Authorization: Bearer <SYNC_SECRET>` or `x-sync-secret`. Schedule reads return
`Cache-Control: no-store`. There is no public schedule or draft-data API.

| Endpoint | Action |
| --- | --- |
| `PUT /api/articles` with optional `showAt` | Atomically register/update an announcement and schedule its website release |
| `PUT /api/articles/schedule` | Create or change the website schedule of an existing announcement |
| `GET /api/articles/schedule?blog=...&sourceArticleId=...` | Read one announcement, its schedule and state; unknown identity returns 404 |
| `GET /api/articles/schedule?status=scheduled&page=1&limit=25` | Read a list; optional status is automatic/scheduled/published/cancelled, limit 1–100 |
| `DELETE /api/articles/schedule` | Cancel and hide the announcement until explicitly scheduled/released again |
| `POST /api/articles/schedule/publish` | Request immediate website release, still requiring a fresh public Tumblr check |
| `POST /api/articles/process?limit=25` | Process eligible records without page visitors; GET supports an authenticated Vercel Cron call too |

The identity object is `{"blog":"your-shop.tumblr.com","sourceArticleId":"blg_stable_id"}`.
Use it as the JSON body for DELETE and publish-now. To schedule or move an existing
announcement, add `showAt`:

```json
{
  "blog": "your-shop.tumblr.com",
  "sourceArticleId": "blg_stable_id",
  "showAt": "2026-10-27T12:30:00+02:00"
}
```

This becomes `2026-10-27T10:30:00.000Z` in storage and API responses. `Z` is accepted too.
An explicit numeric timezone offset or Z is required; local times without an offset,
invalid dates and IANA zone names in place of an offset are rejected. For Riga, choose
the correct offset for the date (including daylight-saving changes). Past times are
allowed and become eligible on the next processor invocation.

New columns: `showAt` (requested UTC website time), `status`, `shownAt` (actual website
release), `scheduleRevision` (concurrency token), `lastError` (safe verification error).
States behave as follows:

- `automatic`: existing rows, including all migrated rows without a schedule, retain
  their previous visitor-driven Tumblr publication checks and Tumblr date on the card.
- `scheduled`: always hidden, even after showAt, until the independent processor
  verifies that the time has arrived and Tumblr is publicly published.
- `published`: website release completed. `shownAt` and the card date/order reflect
  that website release, rather than the older Tumblr publication time.
- `cancelled`: hidden; cancellation also removes a card that was already visible.
  A later ordinary ingest does not undo cancellation or change an existing schedule.

Private GET responses additionally give `state`: `waiting_time`, `waiting_tumblr`,
`verification_error`, `published` or `cancelled`. A failed check leaves a scheduled
announcement hidden and sets `lastError=tumblr_verification_unavailable`.
Publish-now can therefore return a waiting state;
it never forces a queued/private Tumblr article to become visible.

Creating/moving a schedule or requesting immediate release clears its previous public
snapshot. Content-only PUT calls preserve scheduling columns. If a schedule is supplied
on initial ingest, saving its source data and hidden scheduled state is one upsert;
use this for new future announcements to avoid a gap between ingest and scheduling.
Every schedule change replaces `scheduleRevision`. Processor writes compare both that
token and the content revision, current status and due time, so a stale check cannot
undo a cancellation or reschedule. Public reads re-read state after verification.

Schedule changes, cancellation, publish-now and processor calls invalidate `/articles`
and `/sitemap.xml`. All public article readers use the same status/time gate, including
the sitemap. Processing never exposes a future timestamp, even if stale public data exists.

## Publication gate and outages

All database access goes through `utils/database.ts`. Public rendering checks only the
Tumblr **public posts** API with API-key authentication. The expected ID is tried first;
if absent, all public pages are searched for exactly one matching registered slug.
IDs stay strings. Ambiguous matches, drafts, queued and private posts remain hidden.
The canonical URL and date come from the actual published post.

Verification timestamps and the last successful public snapshots persist in the database,
so they survive serverless restarts. Automatic/published records recheck after five minutes.
A due scheduled record retries after one minute; future and cancelled records are skipped.
A confirmed absence removes a card. A transient response/schema/auth/network failure
preserves the last verified cards and never opens a previously hidden card; another check
is attempted at the next eligible check. A failure in any part of a verification batch
preserves already released cards in that batch; scheduled records stay hidden. Error
details/keys/remote URLs are never returned or stored as `lastError`.
If saving a verification result fails, public pages and the sitemap read only the saved,
verified snapshots with the same status/time gates. The private processor still reports
database errors so the scheduler can retry them.

## Running without visitors

The current public site responds with `server: Vercel` and `x-vercel-id` (checked
2026-10-26). Vercel supports native GET-based Cron Jobs, but the account's billing tier
cannot be determined from this repository: no linked `.vercel/project.json` or Vercel
account credentials are configured here. [Vercel's published limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
allow only daily, hour-precision cron on Hobby and minute-precision cron on Pro/Enterprise.
Do not add a minute-level vercel.json cron that may break a Hobby deployment.

Use the existing self-hosted n8n scheduler for a simple no-new-subscription solution:

1. Schedule Trigger: every minute.
2. HTTP Request: POST `https://<your-domain>/api/articles/process?limit=25`, no request body.
3. Use an n8n Header Auth credential: `Authorization` = `Bearer <SYNC_SECRET>`.
   Store the secret in the credential, never in a public workflow export or URL.
4. Add an IF node checking `failed > 0`, leading to Stop And Error, so Tumblr failures
   trigger the existing n8n error reporting even when the HTTP request succeeded. Also
   keep HTTP errors enabled. Successful repeats are safe. Enable this workflow only after applying
   migration 015 and deploying the API; it was not activated during implementation.

Equivalent external server cron or manual invocation (environment variables supplied
securely on that server):

```sh
curl --fail-with-body --max-time 65 -X POST \
  -H "Authorization: Bearer $SYNC_SECRET" \
  "$SITE_URL/api/articles/process?limit=25"
```

The processor handles up to `limit` eligible rows, oldest checked first, without social
publishing or paid queue services. The response reports `processed`, `published` (verified
cards), `waiting`, `failed`, `superseded`, `changed` and `disabled`. With no `TUMBLR_API_KEY`,
`disabled` is true and every counter is zero; no records are processed or changed.
Otherwise `disabled` is false; remaining eligible rows are handled
on subsequent calls. Running it every minute means release is at or after showAt,
usually within one minute plus the Tumblr request time. API outages, paused schedulers
or backlogs delay release; they never move it earlier. Visitors do not release scheduled
records, so configuring the scheduler is required for unattended operation.

If the existing Vercel account already supports minute cron, an optional alternative is
`{"crons":[{"path":"/api/articles/process","schedule":"* * * * *"}]}` in vercel.json.
Configure Vercel `CRON_SECRET` to exactly the same value as `SYNC_SECRET`; Vercel sends it
as a Bearer header, and the existing authorization helper checks SYNC_SECRET. A cron User-Agent
or header alone is never authorization. See [Vercel Cron security](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
No Vercel cron file, external live workflow, account plan change or deployment is created here.

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
