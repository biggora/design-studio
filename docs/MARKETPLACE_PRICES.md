# Cached T-shirt prices and Product structured data

Price collection runs in **pod-uploader**, using the owner's existing local browser profiles. Design Studio never requests a marketplace or executes curl during page rendering. It reads the public JSON snapshot from its configured `NEXT_PUBLIC_IMAGES_CDN` instead. No new paid service or storefront database migration is needed.

## Publisher

See pod-uploader `docs/prices.md` and `pod prices refresh --help`. The command uses the existing `LISTINGS_API_TOKEN` to read canonical linked sources from `GET /api/v1/designs/tshirt-prices` (paginated, or `?id=<UUID>`). This route uses the existing database facade and active-design filters for both providers. Deploy this endpoint before running the command against production; an older site returns 404.

Collection reads the actual T-shirt Product/Offer JSON-LD on Redbubble, TeePublic, Tostadora and Zazzle. Redbubble's generic work page resolves to the same work's Classic T-Shirt, never a shop tile's From price. No reviews, identifiers, shipping or return claims are fabricated. CAPTCHA/challenge stops the account; there is no automated interaction with the challenge. HTTP/collection failures preserve the last verified quote without changing its timestamp.

Quotes are persisted in the uploader's SQLite, independently of upload jobs. Quotes younger than 24 hours are skipped unless `--force` is supplied. `--publish` writes one mutable R2 object `prices/<storefront UUID>/tshirt-v1.json` with `{version:1,designId,offers}` and a five-minute public cache policy. Existing image objects retain their year-long immutable policy. No upload hook, daily timer, n8n workflow or OS task is installed; the user currently requested the CLI script first. A future daily invocation can use `--publish --force`.

## Storefront

`lib/marketplace-prices.ts` fetches only our CDN JSON, with a two-second timeout and five-minute Next data cache. It validates snapshot version, design UUID, marketplace/listing identity, amount, currency and freshness. Quotes expire after 36 hours or the source sale deadline, whichever is earlier. CDN and Next caches can delay a newly published value by roughly ten minutes; timestamp validation still excludes expired quotes. Missing, malformed, timed-out or stale data yields no price/Product and does not trigger collection.

Visible quotes keep each marketplace's own currency. They are not aggregated: stores can sell different shirt variants. Redbubble, TeePublic, Tostadora and Zazzle are the priority order for one concrete Product. The visible name, image, amount and currency correspond to that Product's quote. The Redbubble CTA and mobile bar use its exact verified shirt URL when available. Existing fallback purchase links, affiliate handling, Organization, WebSite, CreativeWork, BreadcrumbList and page metadata are retained.

Catalog, collection and gift detail pages also read the same snapshots for their visible prints, in parallel, using the existing five-minute cache and timeout. They show one validated T-shirt price and seller on each card. Listing selection uses the canonical Redbubble/TeePublic links already in the design, without extra database queries; detail pages retain their full four-marketplace lookup. No marketplace collection runs on a page request.

When at least three unique visible prints all have a fresh verified quote, `ItemList.itemListElement.item` contains the corresponding `Product` and `Offer`, with the same price/currency shown on its card. The Product uses the same identity as the detail page. Smaller lists or incomplete price coverage retain the valid ordinary link list, preserving all visible prints without invented prices or partially populated carousel items. Collection and gift index pages remain lists of collections/pages, not products. Carousel eligibility does not guarantee Google displays the feature.

## Verified on 29 October 2026

- Catalog/gift list follow-up: all 16 gift detail pages plus catalog/collection pagination were checked across 117 URLs. 110 lists contained complete products; seven pages with fewer than three items retained ordinary link lists. Every declared price/currency matched the visible card, with no failures. The [catalog code-mode test](https://search.google.com/test/rich-results/result?id=16bJ3TQ1ufsx84Oev7jv_A) detected 15 valid products; the [Halloween test](https://search.google.com/test/rich-results/result?id=9EtoM-kTTrOA_6H8Sksiag) detected 27, each also recognized as merchant listing data. Schema.org validated the gift ItemList with no errors or warnings. Google recommendations for real reviews/ratings remain optional; neither is invented. This follow-up passed 1,164 tests (163 existing skips), production build, TypeScript, scoped ESLint and the UI detector. These code-mode tests use local HTML, not a production deployment.

- Actual four-source profile collection for `cf908c94-7c1d-465f-a93d-5346d8dbec67`: Redbubble EUR 26.21, TeePublic EUR 16.26, Tostadora GBP 16.95, Zazzle USD 18.24. These are dated observations, not configured prices.
- One snapshot published through the existing R2 credentials and fetched from CDN with HTTP 200 and the five-minute cache policy. A repeat run skipped all four browser lookups and could republish the saved snapshot.
- Local production HTML renders the same four prices and the matching Product, retaining the existing schema graph. Three whole-page requests measured 1720, 1109 and 1037 ms in this environment; these are not an isolated benchmark of price overhead.
- The Product shape retains the previously validated Google Rich Results fields. The previous [Google code-mode test](https://search.google.com/test/rich-results/result?id=DiFhc8UIuLM1GCKdWxHE3Q) detected Product snippets, Merchant listings, Breadcrumbs and Organization without critical errors. Live URL eligibility and a production deployment are separate checks.

The uploader canary used a copy of SQLite with real existing profiles; the original upload database and job states were not changed. The website code and new source endpoint have not been deployed. Ignored `.cache/marketplace-prices-2026-10-29/cached-production-{page.html,proof.json}` contains the rendered proof; uploader `.cache/price-cache-2026-10-29/` contains its test database. No credentials or profile contents belong in Git or reports.

## Validation and self-check

Context: repository AGENTS.md (product goals, facade, scope); pod-uploader AGENTS.md (shared memory); existing profile, store, R2 and CLI modules; Next.js mode and source metadata tests.

Self-check: ran all 11 code dimensions. Fixed before reporting: shared canonical source selection for multiple marketplace accounts; batched storefront listing lookup with failure fallback; strict UUID/limit bounds; the v4 migration test fixture now removes the two newly added tables before resetting its schema version and asserts they return. No schema history or existing assertions were weakened. Infrastructure dimension: not applicable, no infrastructure files or new environment variables.

Site: 1,157 tests passed, 163 skipped with two workers and a 15-second timeout for slow module imports; production build, TypeScript and scoped ESLint passed. Uploader: workspace TypeScript passed; full suite initially had 2,095 passed, 23 skipped and the one v4-fixture failure described above. After fixing that fixture, all 18 affected price/CLI/migration tests passed. The live four-store/R2 repeat test supplements those tests. A credential-value scan of 26 changed/new source and documentation files found no configured secrets. Existing unrelated changes in site docs/plans/TODO.md and uploader docs/mockups/research.md were preserved.
