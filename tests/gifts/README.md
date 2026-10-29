# Gift selection integration tests

This stack runs PostgreSQL 17 + PostgREST 12.2 through the real Supabase JS client, and MySQL 8.4 through the real database facade. Nginx supplies Supabase's `/rest/v1/` prefix. Credentials and JWT secrets are local test fixtures only. No production `.env` is read by the tests.

PowerShell, from the repository root:

```powershell
docker compose -p design-studio-gifts-test -f tests/gifts/compose.yml up -d --build --wait
$env:GIFTS_TEST_DATABASES="1"
npx vitest run utils/gift-selection.integration.test.ts
Remove-Item Env:GIFTS_TEST_DATABASES
docker compose -p design-studio-gifts-test -f tests/gifts/compose.yml down -v
```

The tests delete and seed **only** `gifts_test` in the named disposable project. Do not redirect its database connection to another database. Ports default to 33330 (REST) and 33331 (MySQL); override with `GIFTS_API_PORT` / `GIFTS_MYSQL_PORT` in the shell for both Compose and Vitest. Defaults are documented in `.env.example` here.

Acceptance covers: migration applied twice, matches beyond 501 unrelated items, automatic admission of a new upload, inactive exclusion, holiday isolation, collection-independent matches, page/feed parity, explicit markers, reset to automatic, and marker preservation through metadata changes. It also drops `giftTopics`, verifies filtered reads without migration 016, reapplies the migration and verifies that manual exclusions take effect without restarting the application. Clean-volume `down -v` → `up -d --wait` must succeed twice before running acceptance tests.

The same real-provider suite exercises catalog collection reads: migration 017 replay, secondary memberships, search plus keywords, stable pagination/counts, unknown collections and out-of-range pages. PostgreSQL checks the read-only RPC as `anon`, inactive exclusion, a restrictive RLS policy, and the previous membership-query fallback while the function is absent. MySQL exercises its existing parameterized `EXISTS` path against the same fixtures. PostgreSQL and MySQL suites run sequentially inside this file so their seeded data cannot interfere.
