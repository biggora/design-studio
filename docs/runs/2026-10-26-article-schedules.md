# Website announcement scheduling — 2026-10-26

Implemented the owner's request to schedule the display of website announcements,
independently of Tumblr/Facebook/X posting schedules. This supports timely discovery
of useful articles while preventing future or unverified content from entering public
pages or search-engine discovery. No new paid service or dependency was added.

## Changes

- New paired migration 015 and matching fresh-install schemas add website showAt,
  status, shownAt, scheduleRevision and lastError. Migration 012 and other existing
  migrations are unchanged. Existing rows default to automatic with no website time.
- Authenticated schedule management reads one record/list and creates, reschedules,
  cancels or requests immediate website release. Ingest can include showAt atomically;
  an ordinary later ingest preserves schedules and cancellation.
- An independent processor requires both website time eligibility and a fresh public
  Tumblr publication confirmation before changing scheduled to published. Cancelled
  and future records remain hidden even if an old public snapshot exists. Comparing
  content/schedule revisions and status prevents in-flight checks from reversing
  cancellation or rescheduling. A final database read controls all public output.
- Existing automatic/public snapshots keep their last-good protection on Tumblr API
  failures. New scheduled records stay hidden on failures. The actual website release
  time becomes shownAt and the scheduled card's date; the Tumblr post is not edited.
- Public discovery caches are invalidated after control operations and processor
  invocations, including a partially completed processing batch that then fails.

## Hosting and unattended processing

Read-only headers from threadquirk.lv confirm Vercel. No linked Vercel project/account
credentials are available here to establish its billing tier. Current official docs
restrict Hobby Cron to daily/hour precision and allow minute Cron on paid tiers.
The existing n8n container was independently confirmed running. Recommended setup:
use its Schedule Trigger every minute to POST /api/articles/process with an existing
SYNC_SECRET header credential, and report HTTP failures or failed > 0.

The GET-compatible endpoint also supports native Vercel Cron if the existing account
already supports minute scheduling and CRON_SECRET equals SYNC_SECRET. No live workflow,
Vercel cron configuration, plan change, push or deployment was performed. See
docs/ARTICLES.md for complete endpoints, request examples and setup instructions.

## Verification

- 1054 ordinary Vitest tests pass (153 opt-in/environment-dependent tests skipped).
- Five additional integration tests pass on disposable PostgreSQL 17/MySQL 8.4:
  additive migrations rerun twice, legacy defaults/snapshots preserved, PostgreSQL
  grants and UTC timestamps, both database scheduling paths/revision guards, MySQL
  content upserts preserving a schedule, cancellation and due release.
- New tests cover timezone rejection/normalization, future and cancelled stale
  snapshots, queued/private Tumblr outcomes, verifier outages, fresh website dates,
  API authentication, private no-store reads, pagination/filtering, publish-now gate,
  cache invalidation, and cancellation/rescheduling during a check.
- Isolated production HTTP checks pass for authentication, UTC schedule creation/list,
  move, unavailable verification, cancellation, publish-now still hidden, and exclusion
  from /articles HTML and sitemap. They used only synthetic records and an empty Tumblr
  API key; no remote post was fetched or published by this test.
- TypeScript and ESLint over application source directories pass. Production build
  passes against the disposable MySQL database, explicitly trusting only its test CA
  for that build process. The first attempt correctly refused that untrusted test CA;
  application TLS verification was not disabled or weakened.
- Self-check: ran all 11 code-review dimensions. Fixed before reporting: re-reading
  public state after concurrent schedule changes, schedule-token guarded writes,
  timezone-normalized database responses, and invalidation after partial processing
  failures. No schema, announcement or scheduler changes were applied to production.
