# Listing transaction tests

Disposable PostgreSQL 17 and MySQL 8.4; no deployment credentials or `.env` files are used.
The suite resets only its fixed `listings_test` databases. MySQL binds to localhost port 33316;
set `LISTINGS_MYSQL_PORT` before both Compose and Vitest to use a different local port.

```powershell
docker compose -p design-studio-listings-test -f tests/listings/compose.yml up -d --wait
$env:LISTINGS_TEST_DATABASES = '1'
node node_modules/vitest/vitest.mjs run utils/listings-database.test.ts
Remove-Item Env:LISTINGS_TEST_DATABASES
docker compose -p design-studio-listings-test -f tests/listings/compose.yml down -v
```

The tests replay migration 018 twice and verify additive collection assignments, stable primary
labels, platform properties, idempotent repeats, and full rollback on an unknown title.
