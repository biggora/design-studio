# Social posts: Facebook, Tumblr, scheduled status, delete

Goal: the social-posts API (`/api/v1/social-posts`, migration 004) covers the
networks prints are posted to now (Facebook Page posts, Tumblr posts), records
posts placed in a platform's native scheduler, and can delete a mark recorded by
mistake. Same contract is implemented in parallel by pod-studio.

## Contract

- Channels: add `facebook` (hosts `facebook.com`, `fb.com`, `fb.me`, subdomains
  ok) and `tumblr` (`tumblr.com`, subdomains ok, e.g. `threadquirk.tumblr.com`).
- Status: add `scheduled`; `publishedAt` then holds the planned publish time.
  Transitions: scheduled -> published, scheduled -> removed, published -> removed;
  same-status updates stay allowed. Rejected (409): removed -> published (as
  before), removed -> scheduled, published -> scheduled. `removedAt` rules are
  unchanged: required for `removed`, rejected/cleared otherwise.
- `DELETE /api/v1/social-posts?id=<uuid>` or
  `?channel=<c>&externalId=<id>`: same Bearer auth, hard delete,
  `200 {"deleted":true,"post":{...}}`, `404 NOT_FOUND` when nothing matched,
  `400` for any other parameter combination.
- GET `status` filter accepts `scheduled`; summary already groups by status, so
  scheduled rows appear there without a new parameter.

## Files

- `init/migrations/014_design_social_posts_channels_{postgres,mysql}.sql`:
  replace the channel and status CHECKs (found by definition, like 011/013, so
  reruns change nothing). Postgres also `CREATE OR REPLACE`s
  `upsert_design_social_post` (transition rules, `removedAt` only for
  `removed`) and adds `delete_design_social_post(identity JSONB)`
  (`SECURITY INVOKER`, service_role only).
- Snapshots kept in sync: `init/postgres_tables.sql`, `init/mysql_tables.sql`
  (CHECK lists), `init/postgres_functions.sql` (upsert + delete).
- `lib/social-posts.ts`: `SOCIAL_STATUSES`, channels, `CHANNEL_HOSTS`,
  `removedAt` rule, `parseSocialPostDeleteQuery`.
- `utils/social-posts-database.ts`: MySQL transition rules + `deleteSocialPostMySQL`.
- `utils/database.ts`: `deleteSocialPost` (RPC / MySQL).
- `app/api/v1/social-posts/route.ts`: `DELETE` handler.
- Docs: `docs/PUBLIC_API.md`, `docs/DATABASE.md`.

## Tests

- `lib/social-posts.test.ts`: facebook/tumblr accepted, look-alike hosts rejected,
  scheduled accepted (with/without removedAt), delete query parsing.
- `app/api/v1/social-posts/route.test.ts`: DELETE by id and by identity, 404,
  400, 401/503.
- `utils/social-posts-database.test.ts` (real Postgres 17 / MySQL 8.4
  containers, `LISTINGS_TEST_DATABASES=1`): apply 014 twice, transitions, delete.

## Owner steps

Apply migration 014 (`npm run db:migrate` or by hand) before deploying the code;
deploying first would make new-channel posts fail on the old CHECK constraints.
