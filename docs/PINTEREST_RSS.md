# Pinterest auto-publish: landing pages, pin images and RSS feeds

Pinterest's business account has claimed `threadquirk.lv` (the `p:domain_verify`
tag is emitted from the `verification.pinterest` studio row). Pinterest's
**"Auto-publish Pins from your RSS feed"** turns each feed item into a Pin on
one board, oldest first, at most 200 per day per feed. This document describes
the three pieces design-studio adds for that, how to wire them up in Pinterest,
and the rules the implementation follows.

- Feed spec followed: [help.pinterest.com — Auto-publish Pins from your RSS feed](https://help.pinterest.com/en/business/article/auto-publish-pins-from-your-rss-feed)
  (RSS 2.0 only, all URLs on the claimed domain, one Pin per image found).

---

## 1. What gets created

### 1.1 Landing page `GET /p/{slug}`

A minimal, mobile-first page per design. Pinterest feed items link here so a
buyer reaches the marketplace in one click while the Pin URL stays on the
claimed domain.

Layout order on a phone: design image on its background colour (height-capped
so everything below fits a 390×844 viewport without scrolling) → `h1` title →
**"Buy on Redbubble ↗"** (primary) → **"Buy on TeePublic ↗"** (when the design
has a TeePublic link) → the affiliate disclosure ("…We may earn a commission —
learn more", linking [/disclosure](../app/disclosure)) → "More about this
design →" to the regular `/designs/{slug}` page.

- The buy buttons are the **same affiliate-wrapped links as the design page**
  (`applyRedbubbleAffiliate` / `applyTeepublicReferral`, `rel="sponsored
  noopener noreferrer"`, `target="_blank"`). Nothing else on the page alters or
  re-wraps them.
- **No auto-redirect, ever.** Pinterest treats deceptive redirects as spam and
  the affiliate terms forbid altering the links.
- Head: `<link rel="canonical" href="https://{domain}/designs/{slug}">`
  (canonical points at the real catalog page), `<meta name="robots"
  content="noindex,follow">`, Open Graph tags with the pin image (§1.2) as the
  preview.
- A design with **no marketplace link at all** returns **404**. When the design
  has no Redbubble listing, **TeePublic becomes the primary button**.
- No client-side JavaScript is added beyond what the shared layout already
  loads (header/footer, cookie banner, analytics).

The page resolves a legacy UUID the same way `/designs/{slug}` does, so
`/p/{uuid}` also works for designs synced before slugs existed.

### 1.2 Pin image `GET /p/{slug}/pin.jpg`

A 1000×1500 (2:3) JPEG rendered server-side per request:

- 1000×1500 canvas filled with the design's `backgroundColor`;
- the design's display image (`getDesignDisplayImage` — Classic T-Shirt mockup
  when captured, else the flat artwork) fetched **server-side** from the
  allow-listed Redbubble host, scaled to fit ~1000×1000, centred in the upper
  part;
- the design title in the lower band (dark text on light backgrounds, white on
  dark), clamped to 3 lines. No prices, no third-party logos.

Rendering uses what the repo already has: `next/og`'s `ImageResponse` (satori +
bundled Noto Sans — no system-font dependency) for the layout, then `sharp`
for the JPEG encode (≤ 1 MB; quality steps down if needed). Both ship with
next itself; **no new dependency**.

- `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate`.
- The feed appends `?v={updatedAt hash}` (§2); the route ignores the param — it
  only busts caches when a design changes.
- Upstream fetch failure (or a non-allow-listed image host, or a design without
  an image) → **503** / **404** respectively, both `no-store`, so the CDN never
  caches a broken pin. Pinterest only ever sees the `threadquirk.lv` URL.

### 1.3 RSS feeds per collection

- `GET /feeds/pinterest/{collectionSlug}.xml` — RSS 2.0
  (`xmlns:media="http://search.yahoo.com/mrss/"`,
  `Content-Type: application/rss+xml; charset=utf-8`), one item per eligible
  design, newest first, at most the 100 most recent
  (`FEED_MAX_ITEMS` in `lib/pinterest-feed.ts`).
  `Cache-Control: public, s-maxage=3600, stale-while-revalidate` (Pinterest
  polls about once a day).
- Item shape (fields Pinterest reads):

```xml
<item>
  <title>Look Past the Stars Astronaut Design</title>
  <link>https://threadquirk.lv/p/look-past-the-stars-astronaut-design</link>
  <guid isPermaLink="true">https://threadquirk.lv/p/look-past-the-stars-astronaut-design</guid>
  <description>A bold typographic space graphic featuring an explorer with a telescope on a rugged lunar landscape.</description>
  <pubDate>Wed, 07 Oct 2026 08:10:00 GMT</pubDate>
  <media:content url="https://threadquirk.lv/p/look-past-the-stars-astronaut-design/pin.jpg?v=3f2a9c" medium="image" type="image/jpeg" width="1000" height="1500"/>
</item>
```

  - `<title>` — design title, at most 100 characters.
  - `<link>`/`<guid>` — `https://{domain}/p/{slug}`; the guid is the design's
    landing URL and never changes (the slug is assigned once at insert and
    never rewritten; pre-slug designs fall back to their UUID, equally stable).
  - `<description>` — design description as plain text: HTML stripped, URLs
    removed (every URL in the feed must stay on the claimed domain),
    whitespace collapsed, at most 500 characters.
  - `<pubDate>` — RFC 822; the earliest `design_listings.publishedAt` for the
    design when one exists, else the design's `createdAt`.
  - Exactly **one** `<media:content>` per item and no `<enclosure>` and no
    images in the description — Pinterest creates one Pin per image found, so
    any second image would double-pin the design.

**Item eligibility** (enforced in `fetchCollectionFeedDesigns`,
`utils/database.ts`):

- the design has a display image (`mockup_tshirt` or `externalImageUrl`);
- the design has a marketplace link (Redbubble `externalLink`/`externalId`, or
  a validated `props.teepublicLink`) — the same rule the landing page's 404
  uses;
- the design has **no `design_social_posts` row with `channel = 'pinterest'`
  and `status = 'published'`** — designs pod-uploader already pinned through
  the API are skipped so nothing is pinned twice. (`removed` posts do not
  block re-publication through RSS.)
- **Trashed/hidden state does not exist in this schema** — there is no such
  column (`designs.shared` is written `false` by the sync and never used as a
  filter), so there is nothing extra to skip. If a visibility flag is added
  later, `fetchCollectionFeedDesigns` is the place to apply it.

**Collection slugs.** The `collections` table has no slug column, so feeds
address collections by a deterministic derivation of the title
(`collectionSlugFor` in `lib/pinterest-feed.ts`):
`"Bugs, Tests and Hallucinations"` → `bugs-tests-and-hallucinations`
(NFKD-diacritics-stripped, lowercased, non-alphanumerics dropped, whitespace →
hyphens). Two titles that slugify identically get `-2`/`-3`… suffixes assigned
in title order, so the mapping is stable for a stable collection set. Unknown
slugs → 404. The handler lives at `/feeds/pinterest/[collectionSlug]` (the App
Router only recognizes `[param]` spanning a whole segment); the `.xml` URL is
kept by an additive rewrite in `next.config.mjs`.

**Collections source.** Feeds read the `collections` table (title +
description) joined through `design_collections` — the same source of truth as
the Redbubble sync — and fall back to the legacy `designs.collection` labels
(with empty descriptions) on installs without those tables. The channel
`<link>` is the site's collection page (`/designs?collection={title}`).

### 1.4 Feed index `GET /feeds/pinterest.xml`

A small RSS document listing every collection feed: item `<title>` is
`{site name} – {collection}` (the Pinterest board name), `<link>` is the feed
URL to paste into Pinterest, `<description>` carries the item count and the
board description to paste. Same caching as the collection feeds.

---

## 2. URL patterns

| What | URL |
|---|---|
| Landing page | `https://threadquirk.lv/p/{design-slug}` |
| Pin image | `https://threadquirk.lv/p/{design-slug}/pin.jpg?v={updatedAt-hash}` |
| Collection feed | `https://threadquirk.lv/feeds/pinterest/{collection-slug}.xml` |
| Feed index | `https://threadquirk.lv/feeds/pinterest.xml` |

`{design-slug}` is `designs.slug` (falling back to the design UUID).
`?v=` is a 6-hex SHA-256 prefix of the design's `updatedAt` (or `createdAt`),
so a changed design gets a fresh pin URL past caches; the guid never includes
it.

---

## 3. Pinterest setup (one board per feed, desktop only)

1. Create the boards first: one board per collection, **named exactly like the
   collection title**, with the collection description as the board description
   (`npm run feeds:list` prints the ready-made table, or read them off
   `/feeds/pinterest.xml`).
2. On desktop, open **Pinterest → Settings → Create Pins in bulk → Auto-publish
   → Connect RSS feed**.
3. Paste one feed URL from the table below, pick the matching board, save.
4. Repeat for every feed. Pinterest validates the feed immediately; items then
   publish oldest first, at most 200/day, within 24 hours of the fetch.
5. The domain must stay claimed on the business account (it is — keep the
   `verification.pinterest` studio row intact); Pinterest rejects feeds whose
   links leave the claimed domain.

`npm run feeds:list` (reads `.env`, read-only) prints the live table:

| Feed URL (paste into Pinterest) | Board name | Board description | Items |
|---|---|---|---|
| `https://threadquirk.lv/feeds/pinterest/{collection-slug}.xml` | `{collection title}` | `{collections.description}` | eligible designs, ≤ 100 |

The exact list of the site's 25 collections is deployment data — run
`npm run feeds:list` against the production `.env` (or open
`/feeds/pinterest.xml`) to print it; the index route serves the same table
live, so the doc never drifts from the database.

---

## 4. Rules the implementation enforces (Pinterest compliance)

- **RSS 2.0, served as XML** — `application/rss+xml; charset=utf-8`; no Atom.
- **Every URL on the claimed domain**: channel link, item links, guids, the
  `media:content` URL — all `https://{domain}/…`. Descriptions are stripped of
  URLs. There is a unit test that fails if any other host appears in the feed.
- **One image per item** → one Pin per item: exactly one `media:content`, no
  `<enclosure>`, no image markup in descriptions.
- **Stable guids**: `/p/{slug}` never changes for a design.
- **No redirects**: the landing page never auto-redirects; it renders the
  design and the buy buttons.
- **Duplicate-pin guard**: designs already pinned via the pod-uploader API
  (`design_social_posts`, `status = 'published'`) are excluded from feeds.
  Note this exclusion is fail-open: if the private social-posts table cannot
  be read (e.g. the deployment runs without `SUPABASE_SERVICE_ROLE_KEY`), the
  feed is served without the exclusion and the error is logged — a dead feed
  would stop auto-publish entirely. Deployments that use the social-posts API
  already carry the service-role key.

## 5. Files

| File | Purpose |
|---|---|
| `app/p/[slug]/page.tsx` | The landing page (server component, no new client JS). |
| `app/p/[slug]/pin.jpg/route.ts` | Pin image route (fetch → compose → JPEG). |
| `app/feeds/pinterest/[collectionSlug]/route.ts` | Per-collection RSS feed (the `.xml` URL rides on a rewrite). |
| `app/feeds/pinterest.xml/route.ts` | Index of all feeds. |
| `lib/pinterest-feed.ts` | Slug derivation, version hashes, RSS builders (pure, unit-tested). |
| `lib/pin-image.tsx` | Pin composition (`next/og` + `sharp`). |
| `utils/database.ts` | `fetchFeedCollections`, `fetchCollectionFeedDesigns` (Supabase + MySQL). |
| `scripts/list-pinterest-feeds.ts` | `npm run feeds:list` — prints the setup table. |

Tests: `lib/pinterest-feed.test.ts`, `utils/feed-database.test.ts`,
`app/p/[slug]/page.test.ts`, `app/p/[slug]/pin.jpg/route.test.ts`,
`app/feeds/…/route.test.ts` — covering RSS validity, one `media:content` per
item, the claimed-domain rule, the 100-item cap, the API-pinned exclusion,
above-the-fold button layout, the TeePublic-primary fallback, the 404 rules,
and the 1000×1500 rendering with a mocked upstream.
