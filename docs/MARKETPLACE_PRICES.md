# Cached T-shirt prices and Product structured data

Price collection runs in **pod-uploader**, using the owner's existing local browser profiles. Design Studio never requests a marketplace or executes curl during page rendering. It reads the public JSON snapshot from its configured `NEXT_PUBLIC_IMAGES_CDN` instead. No new paid service or storefront database migration is needed.

## Publisher

See pod-uploader `docs/prices.md` and `pod prices refresh --help`. The command uses the existing `LISTINGS_API_TOKEN` to read canonical linked sources from `GET /api/v1/designs/tshirt-prices` (paginated, or `?id=<UUID>`). This route uses the existing database facade and active-design filters for both providers. Deploy this endpoint before running the command against production; an older site returns 404.

Collection reads the actual T-shirt Product/Offer JSON-LD on Redbubble, TeePublic, Tostadora and Zazzle. Redbubble's generic work page resolves to the same work's Classic T-Shirt, never a shop tile's From price. Some TeePublic pages have unescaped quotes in Product names: only when that Product JSON fails to parse, the collector can read the page's unique `og:url`, `product:price:amount` and `product:price:currency` tags, applying the same listing-ID, positive-amount and currency checks. It does not repair JSON or substitute metadata for a valid but expired offer.

No reviews, identifiers, shipping or return claims are fabricated. CAPTCHA/challenge or two consecutive collection errors stop that account. Use the existing account login flow when human attention is required, then rerun the command. HTTP/collection failures preserve the last verified quote without changing its timestamp.

Successful quotes are saved immediately in the uploader's SQLite, independently of upload jobs. Quotes younger than 24 hours are skipped unless `--force` is supplied. After collection across all selected accounts, `--publish` writes one mutable R2 object per design, `prices/<storefront UUID>/tshirt-v1.json`, with `{version:1,designId,offers}` and a five-minute public cache policy. Republishing saved quotes does not extend their lifetime. If no fresh quotes remain, no empty snapshot is published. Existing image objects retain their year-long immutable policy.

No upload hook, daily timer, n8n workflow or OS task is installed. A future daily invocation can use `--publish --force`; collection runs sequentially, with ten-second pauses between designs, so a full catalog can take hours. The CLI prevents overlapping price runs with a renewable SQLite lease.

## Storefront

`lib/marketplace-prices.ts` fetches only our CDN JSON, with a two-second timeout and five-minute Next data cache. It validates snapshot version, design UUID, marketplace/listing identity, amount, currency and freshness. Quotes expire after 36 hours or the source sale deadline, whichever is earlier. CDN and Next caches can delay a newly published value by roughly ten minutes; timestamp validation still excludes expired quotes. Missing, malformed, timed-out or stale data yields no price/Product and does not trigger collection.

Visible quotes keep each marketplace's own currency. They are not aggregated: stores can sell different shirt variants. Redbubble, TeePublic, Tostadora and Zazzle are the priority order for one concrete Product. The visible name, image, amount and currency correspond to that Product's quote. The Redbubble CTA and mobile bar use its exact verified shirt URL when available. Existing fallback purchase links, affiliate handling, Organization, WebSite, CreativeWork, BreadcrumbList and page metadata are retained.

Catalog, collection and gift detail pages also read the same snapshots for their visible prints, in parallel, using the existing five-minute cache and timeout. They show one validated T-shirt price and seller on each card. Listing selection uses the canonical Redbubble/TeePublic links already in the design, without extra database queries; detail pages retain their full four-marketplace lookup. No marketplace collection runs on a page request.

When at least three unique visible prints all have a fresh verified quote, `ItemList.itemListElement.item` contains the corresponding `Product` and `Offer`, with the same price/currency shown on its card. The Product uses the same identity as the detail page. Smaller lists or incomplete price coverage retain the valid ordinary link list, preserving all visible prints without invented prices or partially populated carousel items. Collection and gift index pages remain lists of collections/pages, not products. Carousel eligibility does not guarantee Google displays the feature.

## Breadcrumbs and other lists

`lib/structured-data.ts` shares page, breadcrumb and Product builders. Inner pages receive a default Home → page `BreadcrumbList`; pages with a more specific trail replace that default. The homepage has no breadcrumb. Catalog collections use Home → Our Designs → collection. Paginated design lists retain absolute positions (page two starts at 16) and the total result count.

`/articles` lists `Article` entries. `/collections` and `/gifts` list collection/gift pages. A gift ideas page groups individual prints; it is not a product bundle sold by this site. These lists remain useful Schema.org data even when Google Rich Results Test does not show a standalone ItemList category.

## Troubleshooting and validation

1. If a local page has no price, check that `NEXT_PUBLIC_IMAGES_CDN` points to the publication destination and that `prices/<UUID>/tshirt-v1.json` exists. Starting Next.js does not collect prices. Publish from the uploader; use `--studio-url http://localhost:3000` when the source endpoint is only available locally.
2. Check `checkedAt`, `expiresAt`, source listing IDs and currency in the snapshot. A price older than 36 hours, an ended sale or a changed marketplace link is excluded. Allow roughly ten minutes for the CDN and Next data caches after publishing.
3. For a product list, check every visible unique print: this implementation emits nested Products only with at least three items and complete fresh price coverage. A missing quote keeps the whole list as named links; available card prices can still appear.
4. Inspect the rendered HTML's `application/ld+json` scripts. Use Schema.org's validator for the full graph and Google Rich Results Test for supported search features. To test localhost, paste the rendered HTML into code mode. A saved result does not refresh when the code changes; start a new test. A production URL test is a separate check after deployment.

Google may recommend reviews, ratings, identifiers, shipping or return fields. Add them only when supported by real, visible information. A valid Product or ItemList does not guarantee a rich result or indexing. See Google's [Product snippets](https://developers.google.com/search/docs/appearance/structured-data/product-snippet) and [carousel beta](https://developers.google.com/search/docs/appearance/structured-data/carousels-beta) documentation.

## Verified on 29 October 2026

- Catalog/gift list follow-up: all 16 gift detail pages plus catalog/collection pagination were checked across 117 URLs. 110 lists contained complete products; seven pages with fewer than three items retained ordinary link lists. Every declared price/currency matched the visible card, with no failures. The [catalog code-mode test](https://search.google.com/test/rich-results/result?id=16bJ3TQ1ufsx84Oev7jv_A) detected 15 valid products; the [Halloween test](https://search.google.com/test/rich-results/result?id=9EtoM-kTTrOA_6H8Sksiag) detected 27, each also recognized as merchant listing data. Schema.org validated the gift ItemList with no errors or warnings. Google recommendations for real reviews/ratings remain optional; neither is invented. This follow-up passed 1,164 tests (163 existing skips), production build, TypeScript, scoped ESLint and the UI detector. These code-mode tests use local HTML, not a production deployment.

- Full collection covered 624 active prints and saved 1,471 verified quotes: Redbubble 624, TeePublic 610, Tostadora 138 and Zazzle 99. After the TeePublic parsing fix, a resume collected the remaining 38 TeePublic quotes with no failures. All 624 published CDN snapshots returned HTTP 200 and matched the fresh SQLite quotes and source identities. This full run used the normal uploader database; existing upload job IDs and states were unchanged.
- Breadcrumb audit: 712 URLs, including all 679 sitemap URLs and additional cases. All 711 inner pages had one breadcrumb; the homepage had none. Seven metadata comparisons retained the existing values.
- The earlier four-marketplace canary used a copy of SQLite. It verified one design's visible prices and matching Product, then skipped all four lookups on a repeat run. That isolated canary is separate from the full collection above.

Verification artifacts are local and ignored: site `.cache/breadcrumb-lists-2026-10-29/` holds HTML and validator/audit reports; uploader `.cache/prices-full-2026-10-29/` holds run and snapshot audit reports. These checks do not establish the current production deployment state. No credentials or profile contents belong in Git or reports.
