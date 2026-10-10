# Catalog search

Serve the two project goals by helping international English-speaking visitors find existing prints. Implement the requested search on the current database without paid services or schema changes.

- Split queries into unique lowercase letter/number terms. Every term must match title, keywords or description; terms may occur in different fields or a different order. Match from word starts, allowing `cats`/`lovers` but excluding `cat` inside `vacation`.
- Ask the database for matching candidates, preserving collection membership and the optional API keywords filter. Supabase retrieves candidates in batches to avoid response row limits; MySQL retrieves the matching rows.
- Rank on the server using one shared implementation: title matches weigh more than tags, tags more than descriptions, with bonuses for an exact title or full phrase. Preserve the database's newest-first/id order for ties.
- Rank all candidates before paginating. Empty queries keep the existing browsing behavior; punctuation-only queries return no results.
- Keep results server-side. This deliberately trades candidate retrieval for a small, migration-free implementation appropriate to the current 284-print catalog. Revisit database-side ranking if measured catalog growth makes this expensive.

Alternatives considered: database-side ranking would require a Supabase SQL function/migration; an external search engine adds another service. Neither is needed for this scoped fix.

Verification: first reproduce missed tag/description matches in tests; check both provider branches, relevance across pages, collection/keywords filters and stable ties. Then run the regression suite, lint and build. Query the configured database read-only and compare results for `cat lover gift` with the eight known print IDs from the audit. No deployment is included in this request.

Verified on 2026-10-10: the configured Supabase returns 17 matches for `cat lover gift`; all eight known prints occupy the first eight positions. The eight are a minimum acceptance set, rather than a limit: additional matches come from searching descriptions and individual words. Both provider branches pass regression tests; the full suite passes 545 tests (90 existing database integration tests skipped). Production build passes; lint has no errors (94 existing warnings in bundled skill scripts, no warnings in changed source files).

The locally served production build also passes read-only HTTP checks: catalog and public API show the eight known prints first; combining search with `keywords=cat lover gift` returns exactly those eight; page two contains the remaining two results after the first 15; punctuation-only search is empty; ordinary browsing still returns the whole current catalog (285 prints at verification time).
