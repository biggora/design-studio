# Public Prints API

## 1. Purpose

`/api/v1/prints*` and `/api/v1/collections` are public, unauthenticated, read-only JSON endpoints for embedding the design catalog on other websites. They return a curated subset of each design's fields (see §4). `/api/v1/listings` is a separate authenticated ingest/lookup API for pod-uploader, described below. `/api/v1/social-posts*` is a second authenticated API for recording social posts, described under "Social posts ingest".

---

## 2. Setup

The API allows any origin by default. To **restrict** which sites' browsers may call it directly (client-side `fetch`), set:

| Variable | Required | Default | Description |
|---|---|---|---|
| `PRINTS_API_ALLOWED_ORIGINS` | No | `*` (any origin) | Comma-separated list of exact origins (scheme + host + port, e.g. `https://partner.example`) allowed via CORS, or `*` to allow any origin. A trailing slash on an entry is tolerated (stripped before comparison). |

- **Empty/unset**: defaults to `*` — every origin is allowed. Server-to-server calls (curl, backend fetch, etc.) are unaffected either way — CORS is a browser-enforced restriction, not a server-side gate.
- **`*`**: every origin is allowed.
- **Specific origins**: set a comma-separated allowlist to restrict access; only an exact match (after trailing-slash stripping) between the request's `Origin` header and an allowlist entry gets `Access-Control-Allow-Origin` echoed back.
- The response always includes `Vary: Origin`.
- Changing this variable requires a redeploy/restart of the app for the new value to take effect (it's read from `process.env` at request time in a long-running/serverless process, but most hosts only pick up new env vars on a fresh deploy).
- **Affiliate programs (Impact/Redbubble, TeePublic) require every domain that displays your affiliate links to be listed in the affiliate profile.** Restrict this allowlist to your real embed partners in production and register those domains in the Impact account's Media Properties.

---

## 3. Endpoint reference

All endpoints:
- Are `GET` (plus `OPTIONS` for CORS preflight, which returns `204` with the CORS headers and no body).
- Return JSON with `Content-Type: application/json`.
- Return `{ "error": string }` with an appropriate status code on failure (see §5).

### 3.1 `GET /api/v1/prints`

Paginated, searchable list of prints.

| Param | Type | Default | Range / limits |
|---|---|---|---|
| `page` | integer | `1` | Clamped to `1`–`10000`; a missing, non-numeric, or non-integer value falls back to the default (not an error). |
| `limit` | integer | `12` | Clamped to `1`–`50`; same fallback rule as `page`. |
| `q` | string | `""` | Trimmed, then truncated to 100 characters. Matched case-insensitively against `title` (SQL `ILIKE`/`LIKE` substring match). |
| `collection` | string | `""` | Trimmed, then truncated to 100 characters. Exact match against a collection title. |
| `keywords` | string | `""` | Comma-separated list. Each entry is trimmed, lowercased, and must match `[\p{L}\p{N} _-]{1,50}` (letters, numbers, spaces, `_`/`-`, 1-50 chars) or it is silently dropped; duplicates are removed and at most 10 entries are kept. A print matches if it contains **any** of the given keywords as a case-insensitive substring of its `keywords` tag list (OR semantics). Combinable with `q`/`collection` (AND between `q`, `collection`, and `keywords`). |
| `bg` | string | *(none)* | Optional per-request background override — `auto`, `white`, `black`, or a raw signed color token. See §3.5. Omitting it leaves `imageUrl`/`backgroundColor` unchanged. `400` (`{"error":"Invalid bg"}`) if given and not one of those forms. |

Response body:

```json
{
  "items": [ /* PublicPrint[] — see §4 */ ],
  "page": 1,
  "limit": 12,
  "total": 137
}
```

Status codes: `200` on success, `400` (`{"error":"Invalid bg"}`) for an invalid `bg`, `500` (`{"error":"Internal server error"}`) if the database query throws.

Cache-Control: `public, s-maxage=300, stale-while-revalidate=600` (5-minute CDN cache, 10-minute stale-while-revalidate) on success; `no-store` on error responses.

### 3.2 `GET /api/v1/prints/random`

Random sample of prints, for rotating referral widgets.

| Param | Type | Default | Range / limits |
|---|---|---|---|
| `limit` | integer | `3` | Clamped to `1`–`12`; missing/non-numeric/non-integer falls back to the default. |
| `collection` | string | `""` | Trimmed, then truncated to 100 characters. Exact match against a collection title. When empty, no collection filter is applied (all designs are eligible). |
| `keywords` | string | `""` | Same parsing and OR-semantics as in §3.1's `keywords` param. Combinable with `collection`. |
| `bg` | string | *(none)* | Same optional background override as §3.1's `bg` param — see §3.5. |

Response body:

```json
{
  "items": [ /* PublicPrint[] — see §4, length <= limit */ ]
}
```

There is no `page`/`total` — this endpoint is a single random draw, not a paginated list.

Status codes: `200` on success, `400` (`{"error":"Invalid bg"}`) for an invalid `bg`, `500` (`{"error":"Internal server error"}`) if the query throws.

Cache-Control: always `no-store` — random results are never cached (each request re-rolls the sample).

### 3.3 `GET /api/v1/prints/{id}`

A single print by its internal `id`.

| Param | Type | Default | Range / limits |
|---|---|---|---|
| `id` (path) | string | — | Rejected with `400` if longer than 100 characters. No other format validation. |
| `bg` | string | *(none)* | Same optional background override as §3.1's `bg` param — see §3.5. |

Response body:

```json
{
  "item": { /* PublicPrint — see §4 */ }
}
```

Status codes:
- `200` — found.
- `400` — `{"error":"Invalid id"}` when the id exceeds 100 characters, or `{"error":"Invalid bg"}` for an invalid `bg`.
- `404` — `{"error":"Not found"}` when no design matches.
- `500` — `{"error":"Internal server error"}` if the query throws.

Cache-Control: `public, s-maxage=300, stale-while-revalidate=600` on success; `no-store` on any error status (`400`/`404`/`500` all force `no-store`, since the response helper treats any status >= 400 as non-cacheable).

### 3.4 `GET /api/v1/collections`

List of all collection titles.

No query parameters.

Response body:

```json
{
  "items": ["Cats", "Dogs", "States of the USA"]
}
```

`items` is `string[]` — plain collection titles, not objects.

Status codes: `200` on success, `500` (`{"error":"Internal server error"}`) if the query throws.

Cache-Control: `public, s-maxage=300, stale-while-revalidate=600` on success; `no-store` on error.

### 3.5 The `bg` param (on `/prints`, `/prints/random`, `/prints/{id}`)

Redbubble only fills transparent artwork areas with a color that has a matching signed token — arbitrary hex is rejected server-side by the CDN — so `bg` accepts exactly these forms:

| Value | Meaning |
|---|---|
| `auto` | Use this design's own artist-chosen Classic T-Shirt mockup color, if one was captured during sync. No effect (falls back to the stored image) if the design has none. |
| `white` | The site's white background preset. |
| `black` | The site's black background preset. |
| a raw color token (`<hex6>[~<hex6>]:<hash10>`, e.g. `fafafa:ca443f4786`) | Used as-is. |

When `bg` resolves to a usable token for a given print, `imageUrl` and `backgroundColor` in the response are overridden accordingly; `mockupUrl` is unaffected. When it doesn't resolve (e.g. `auto` on a design with no captured mockup), that print's fields are left as stored. An unset `bg` leaves every response byte-identical to omitting it entirely. A `bg` value that doesn't match any of the forms above is rejected with `400`.

---

## 4. `PublicPrint` object

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Internal design id (use this to fetch `/api/v1/prints/{id}`). |
| `title` | string | Design title. |
| `description` | string | Design description (may be an empty string). |
| `imageUrl` | string | Full-artwork image URL, hosted on the Redbubble CDN. |
| `mockupUrl` | string \| null | Classic T-Shirt mockup image URL (`props.mockup_tshirt`), or `null` if not available. |
| `link` | string | Redbubble product page URL, or `""` when no Redbubble listing exists. Use `teepublicLink` or `listings` when empty. Existing Redbubble links keep the same affiliate wrapping. |
| `teepublicLink` | string \| null | TeePublic product page URL (`props.teepublicLink`, validated to `teepublic.com`), or `null` if the design has no TeePublic match. See §4.1 for referral wrapping. |
| `listings` | `{ platform, url }[]` | Additive link projection from ingested marketplace listings; `[]` for designs with only scraper/legacy data. Redbubble/TeePublic URLs use the same affiliate wrappers as the legacy fields. Account names and other listing metadata are omitted. |
| `collection` | string \| null | Collection title, or `null` when the design has no collection (or its collection is the internal `no_collection` placeholder). |
| `keywords` | string[] | Tags/keywords, split on commas, trimmed, with empty entries removed. `[]` if there are none. |
| `backgroundColor` | string \| null | Dominant background color (e.g. a hex string), or `null` if not set. |

Internal-only fields (`imageName`, `shared`, `price`, `externalId`, etc.) are never included in `PublicPrint`.

### 4.1 Affiliate wrapping

Stored URLs are always canonical marketplace URLs. When affiliate tracking is configured via the `studio` table, `link` and `teepublicLink` are wrapped at response time:

| `studio` key | Effect on the response |
|---|---|
| `affiliate.redbubbleTemplate` | Impact deep-link template with a `{url}` placeholder (copied verbatim from Impact's link builder, e.g. `https://shop.pxf.io/c/123/456/789?u={url}`); each `link` becomes the template with `{url}` replaced by the URL-encoded canonical Redbubble URL. |
| `affiliate.teepublicReferralId` | TeePublic referral id; each `teepublicLink` gets `?ref_id=<id>` appended (an existing `ref_id` is replaced). |

Both keys are no-ops while empty: responses then carry the plain canonical URLs. Note that the CDN cache (§3.1) means tracking changes can take up to ~5 minutes to reach all responses.

---

## 5. Error format

Every non-2xx response body has the same shape:

```json
{ "error": "Internal server error" }
```

See each endpoint's status-code table in §3 for the exact messages and when they occur.

---

## 6. Usage examples

Replace `https://your-store.example` with your deployment's own host.

### 6.1 curl

```bash
curl "https://your-store.example/api/v1/prints/random?limit=3"
```

Filter by keywords (OR semantics) combined with a collection (AND between the two filters):

```bash
curl "https://your-store.example/api/v1/prints?keywords=cat,space&collection=Animals"
```

### 6.2 Vanilla JS (fetch + DOM rendering, XSS-safe)

Builds each card with `textContent`/attribute assignment — never `innerHTML` with API data — since the API's `title`, `description`, etc. are attacker-controllable via the synced Redbubble catalog.

```html
<div id="prints-widget"></div>
<script>
  (async () => {
    const container = document.getElementById("prints-widget");
    const res = await fetch("https://your-store.example/api/v1/prints/random?limit=3");
    if (!res.ok) return;
    const { items } = await res.json();

    for (const print of items) {
      const card = document.createElement("a");
      card.href = print.link;
      card.target = "_blank";
      card.rel = "noopener sponsored";
      card.className = "print-card";

      const img = document.createElement("img");
      img.src = print.mockupUrl || print.imageUrl;
      img.alt = print.title; // safe: `alt` is set as a property, not parsed as HTML

      const title = document.createElement("p");
      title.textContent = print.title;

      card.appendChild(img);
      card.appendChild(title);
      container.appendChild(card);
    }
  })();
</script>
```

### 6.3 React

```tsx
import { useEffect, useState } from "react";

type PublicPrint = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  mockupUrl: string | null;
  link: string;
  collection: string | null;
  keywords: string[];
  backgroundColor: string | null;
};

function PrintsWidget() {
  const [prints, setPrints] = useState<PublicPrint[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("https://your-store.example/api/v1/prints/random?limit=3")
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setPrints(data.items || []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      {prints.map(print => (
        <a
          key={print.id}
          href={print.link}
          target="_blank"
          rel="noopener sponsored"
        >
          <img src={print.mockupUrl || print.imageUrl} alt={print.title} />
          <p>{print.title}</p>
        </a>
      ))}
    </div>
  );
}
```

---

## 7. Notes and limitations

- **No authentication and no rate limiting.** Any client that can reach the deployment can call every endpoint (subject to the CORS restriction in §2 for browser callers).
- **`/api/v1/prints/random` is never cached** — every call re-samples from the database, so results differ request to request and CDN caching would defeat the purpose.
- **The other three endpoints are cached at the CDN for 5 minutes** (`s-maxage=300, stale-while-revalidate=600`), so newly synced designs, collection changes, or edits can take up to a few minutes to appear.
- **Supabase random sampling reads up to 1000 design ids** before shuffling and picking a sample — `fetchRandomDesigns` selects only the `id` column with no explicit row limit, and Supabase/PostgREST caps unbounded selects at 1000 rows by default. On a catalog larger than 1000 designs, designs beyond that default page are not eligible for the random draw.
- **Images are hosted on Redbubble's CDN**, not this deployment — `imageUrl`/`mockupUrl` point at `*.redbubble.com`/`*.redbubble.net`.

---

## 8. Affiliate compliance for embedders

Every site that renders prints from this API and links to `link`/`teepublicLink` is displaying the artist's affiliate links. The marketplaces' affiliate terms (and the FTC) require:

- **Disclose.** Display a clear affiliate disclosure on the page where the links are shown (visible without scrolling, near the links — not only in a footer/legal page). Embedding without disclosure is a terms violation once tracking is enabled.
- **Register domains.** Every domain showing the links must be listed in the affiliate profile (Impact Media Properties for Redbubble). Keep this API's `PRINTS_API_ALLOWED_ORIGINS` allowlist aligned with those domains.
- **Don't alter the links.** Use `link`/`teepublicLink` as returned (already wrapped with the configured tracking); appending your own parameters breaks attribution and violates the affiliate terms.
- **Mark paid links.** Render the anchor with `rel="sponsored"` (see the examples in §6).

## Ingest API

Base URL: your Design Studio deployment, e.g. `http://localhost:3000` locally or `https://your-domain.com` in production. Set `LISTINGS_API_TOKEN` on the server and client; Supabase deployments also need the existing `SUPABASE_SERVICE_ROLE_KEY`. This token is independent of `SYNC_SECRET`. Both methods accept only `Authorization: Bearer <token>`; no query token or `x-sync-secret` fallback. Responses always use `Cache-Control: no-store`; the public API's cross-origin GET policy does not apply to this private CLI endpoint.

Apply migration 003 before deployment (see [DATABASE.md](DATABASE.md)). No migration is applied automatically by the route.

### POST /api/v1/listings

Call only after a marketplace publish is confirmed. The JSON body has exactly two objects, `design` and `listing`. Unknown fields at those levels are rejected; `extra` permits arbitrary JSON platform data. Optional fields may be omitted, but cannot be null. Required strings are non-empty.

| Field | Required | Validation |
|---|---|---|
| `design.sourceImageId` | yes | Positive safe integer |
| `design.sha256` | yes | 64 hex characters, saved lowercase |
| `design.title` | yes | ≤ 500 characters |
| `design.description` | no | ≤ 5000 characters |
| `design.tags` | no | ≤ 100 strings, each non-empty and ≤ 100 characters |
| `design.backgroundColor` | no | #rgb or #rrggbb |
| `listing.platform` | yes | redbubble, teepublic, spreadshirt |
| `listing.account` | yes | ≤ 100 characters |
| `listing.externalId` | yes | ≤ 200 characters; digits for Redbubble/TeePublic; Redbubble must fit a JavaScript safe integer |
| `listing.url` | yes | http(s), ≤ 2000 characters, platform's .com domain or subdomain, no credentials |
| `listing.title`, `listing.description` | no | ≤ 500 / 5000 characters |
| `listing.tags` | no | Same limits as design.tags |
| `listing.thumbnailUrl` | no | http(s) URL, ≤ 2000 characters, no credentials |
| `listing.publishedAt` | no | ISO-8601 timestamp with timezone; defaults to now on creation |
| `listing.extra` | no | JSON object, serialized UTF-8 size ≤ 16 KiB |

The optional `extra.mockupTshirt`, when used for the legacy Redbubble image mirror, must be an HTTPS URL on a Redbubble image host supported by the existing image allowlist. Other thumbnail hosts are stored in the listing without adding them to that allowlist.

Example: create a Redbubble listing, then add TeePublic for the same source design:

```bash
curl -s -X POST http://localhost:3000/api/v1/listings \
  -H "Authorization: Bearer $LISTINGS_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"design":{"sourceImageId":299,"sha256":"f45e5bc7a5342c2caa038c57d9e8c368255701b801efc734f67f06d82e3f1971","title":"Look Past the Stars Astronaut Design","tags":["astronaut art","space explorer"],"backgroundColor":"#ffffff"},"listing":{"platform":"redbubble","account":"redbubble:shop-a","externalId":"184507566","url":"https://www.redbubble.com/shop/ap/184507566","publishedAt":"2026-10-07T08:10:00Z"}}'

curl -s -X POST http://localhost:3000/api/v1/listings \
  -H "Authorization: Bearer $LISTINGS_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"design":{"sourceImageId":299,"sha256":"f45e5bc7a5342c2caa038c57d9e8c368255701b801efc734f67f06d82e3f1971","title":"Look Past the Stars Astronaut Design"},"listing":{"platform":"teepublic","account":"teepublic:main","externalId":"99914330","url":"https://www.teepublic.com/t-shirt/99914330-look-past-the-stars-astronaut-design"}}'
```

Response:

```json
{
  "design": {
    "id": "c4e49734-7bb5-46f4-86c8-7ec6a587c128",
    "slug": "look-past-the-stars-astronaut-design",
    "title": "Look Past the Stars Astronaut Design",
    "externalId": 184507566,
    "sha256": "f45e5bc7a5342c2caa038c57d9e8c368255701b801efc734f67f06d82e3f1971",
    "sourceImageId": 299
  },
  "listing": {
    "id": "fe5b49a4-f3fb-4bd0-8a3e-a73364c99f70",
    "platform": "teepublic",
    "account": "teepublic:main",
    "externalId": "99914330",
    "url": "https://www.teepublic.com/t-shirt/99914330-look-past-the-stars-astronaut-design",
    "title": null,
    "tags": null,
    "thumbnailUrl": null,
    "publishedAt": "2026-10-07T08:11:00Z",
    "extra": null
  },
  "created": { "design": false, "listing": true }
}
```

New listing: **201**, even when attaching it to an existing design. Same listing repeat: **200**, updates the supplied fields and preserves omitted metadata (including publishedAt). Identity lookup uses hash, then sourceImageId; if absent, Redbubble externalId or legacy props.teepublicId can adopt a scraper row. It never joins designs by title or silently renames a title conflict. A known source ID/hash cannot be replaced with a different identity. Existing catalog values are only filled when NULL. The explicit marketplace mirrors update canonical legacy links and preserve other props; `extra.mockupTshirt` fills an empty Redbubble mockup prop. Multiple accounts per platform are allowed; the first legacy Redbubble ID stays stable and the legacy link reflects the latest ingested Redbubble listing. All changes occur in one transaction and successful POSTs revalidate the root layout, as the background mutation endpoint does.

### GET /api/v1/listings

Provide exactly one `sha256` or `sourceImageId` query parameter. Hash matching is case-insensitive at validation and lowercase in storage. Unknown/repeated parameters or both identities are rejected. Returns **200** `{ "design": <same design shape>, "listings": [<same listing shape>, ...] }`, or **404** if absent. Listings are ordered by creation time, then ID.

```bash
curl -s -H "Authorization: Bearer $LISTINGS_API_TOKEN" \
  'http://localhost:3000/api/v1/listings?sha256=f45e5bc7a5342c2caa038c57d9e8c368255701b801efc734f67f06d82e3f1971'
curl -s -H "Authorization: Bearer $LISTINGS_API_TOKEN" \
  'http://localhost:3000/api/v1/listings?sourceImageId=299'
```

Errors retain the existing string-valued `error`, with additive machine-readable fields:

```json
{"error":"sha256 and sourceImageId identify different designs","code":"CONFLICT","details":{"sha256DesignId":"...","sourceImageIdDesignId":"..."}}
```

| Status | code | Meaning |
|---|---|---|
| 400 | VALIDATION | Invalid JSON, unknown field, malformed/oversized value or query |
| 401 | UNAUTHORIZED | Missing or wrong bearer token |
| 404 | NOT_FOUND | GET design identity not found |
| 409 | CONFLICT | Inconsistent source identities, unique title, listing owned by another design, or another externalId for the same design/platform/account; transaction rolled back |
| 503 | NOT_CONFIGURED | LISTINGS_API_TOKEN unset; or Supabase service-role key missing |
| 500 | INTERNAL | Database/runtime failure; internal details are not returned |

Validation errors also include `field`; conflicts may include `details`. Redbubble IDs and source image IDs are limited to the JavaScript safe integer range because existing catalog readers return numbers. Store hashes/source IDs in the private client workflow; the public print DTO omits them. A non-Redbubble design remains visible with `link: ""`, its other marketplace links and the existing image placeholder until it has a supported design image.

### Social posts ingest

`/api/v1/social-posts` is a private API, not part of the public embed API. pod-uploader calls it to record the final facts about a social post for a design: the post is `published`, or later `removed`. The design must already exist (create it first with `POST /api/v1/listings`); this API never creates or changes designs.

Authentication and caching match the listings API: `Authorization: Bearer $LISTINGS_API_TOKEN` only, `401 UNAUTHORIZED` for a missing or wrong token, `503 NOT_CONFIGURED` when `LISTINGS_API_TOKEN` is unset, and `Cache-Control: no-store` on every response. Apply migration 004 (after 003) before deployment; see [DATABASE.md](DATABASE.md) §2.7. Supabase deployments also need `SUPABASE_SERVICE_ROLE_KEY`, otherwise requests fail with `503 NOT_CONFIGURED`.

Endpoints:

- `POST /api/v1/social-posts` creates or updates a post.
- `GET /api/v1/social-posts` lists posts.
- `GET /api/v1/social-posts/summary` counts posts per channel, account and status.

#### POST /api/v1/social-posts

The JSON body has exactly two objects, `design` and `post`. Unknown fields at any level are rejected. Optional fields may be omitted but cannot be `null`. Strings are stored as sent (not trimmed), but a blank string is invalid.

| Field | Required | Validation |
|---|---|---|
| `design.sha256` | one of the two | 64 hex characters, case-insensitive, saved lowercase |
| `design.sourceImageId` | one of the two | Positive safe integer |
| `post.channel` | yes | `pinterest`, `bluesky`, `mastodon`, `instagram`, `threads`, `reddit`, `tiktok`, `youtube`, `x`, `linkedin` |
| `post.account` | yes | Non-empty, ≤ 100 characters |
| `post.variant` | yes | Non-empty, ≤ 50 characters. Tells apart several posts of one design on the same account, e.g. different images |
| `post.externalId` | yes | Non-empty, ≤ 200 characters. The channel's own post ID |
| `post.url` | yes | http(s), ≤ 2000 characters, no credentials; host must match the channel (table below) |
| `post.status` | yes | `published` or `removed` |
| `post.publishedAt` | yes | ISO-8601 timestamp with timezone. The API returns it as UTC with milliseconds (`...000Z`) |
| `post.removedAt` | required if `removed`; rejected if `published` | ISO-8601 timestamp with timezone |
| `post.linkUrl` | no | http(s) URL, ≤ 2000 characters, no credentials. Where the post points, e.g. the shop page. No domain check |
| `post.title` | no | Non-empty, ≤ 500 characters |
| `post.caption` | no | Non-empty, ≤ 5000 characters |
| `post.hashtags` | no | Array of ≤ 50 strings, each non-empty and ≤ 100 characters |
| `post.imageUrl` | no | http(s) URL, ≤ 2000 characters, no credentials. No domain check |
| `post.board` | no | Non-empty, ≤ 200 characters (e.g. a Pinterest board) |
| `post.extra` | no | JSON object (not an array), serialized UTF-8 size ≤ 16 KiB |

Provide `design.sha256`, `design.sourceImageId`, or both.

`post.url` must be on the channel's domain or a subdomain of it:

| Channel | Allowed hosts |
|---|---|
| `pinterest` | `pinterest.<tld>` or `pinterest.co.<cc>` / `pinterest.com.<cc>`, with optional subdomains (`www.pinterest.com`, `pinterest.de`, `pinterest.co.uk`, `pinterest.com.au`). Look-alikes such as `pinterest.evil.com` or `notpinterest.com` are rejected |
| `bluesky` | `bsky.app` |
| `mastodon` | any host (instances are self-hosted) |
| `instagram` | `instagram.com` |
| `threads` | `threads.net`, `threads.com` |
| `reddit` | `reddit.com` |
| `tiktok` | `tiktok.com` |
| `youtube` | `youtube.com`, `youtu.be` |
| `x` | `x.com`, `twitter.com` |
| `linkedin` | `linkedin.com` |

Design lookup: `sha256` first, then `sourceImageId`. If neither matches a design, the API returns `404`. If both are given and identify different designs, it returns `409`.

Upsert rules. A post is identified by `(channel, externalId)`.

- A new post returns **201** with `created: true`. A repeat of the same `(channel, externalId)` returns **200** with `created: false`.
- On a repeat, the required fields (`account`, `variant`, `url`, `status`, `publishedAt`) are overwritten. Optional fields that are omitted keep their stored values; supplied ones replace them.
- Sending `status: "published"` clears `removedAt`.
- A `removed` post can be updated again (for example, to correct `removedAt`) as long as it stays `removed`.
- `removed` to `published` returns `409`. Publish a new post instead.
- A post that already belongs to another design returns `409`. Posts are never relinked.
- A design can have only one post per `(channel, account, variant)`. A different `externalId` for the same design, channel, account and variant returns `409`.
- The whole request runs in one transaction. Nothing is written on an error, and the site is not revalidated.

Example: record a published Pinterest pin.

```bash
curl -s -X POST http://localhost:3000/api/v1/social-posts \
  -H "Authorization: Bearer $LISTINGS_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"design":{"sha256":"f45e5bc7a5342c2caa038c57d9e8c368255701b801efc734f67f06d82e3f1971","sourceImageId":299},"post":{"channel":"pinterest","account":"pinterest:shop-a","variant":"main","externalId":"1234567890","url":"https://www.pinterest.com/pin/1234567890/","status":"published","publishedAt":"2026-10-10T09:15:00Z","board":"Space Shirts","title":"Look Past the Stars","hashtags":["astronaut","space"]}}'
```

Response, **201**:

```json
{
  "design": {
    "id": "c4e49734-7bb5-46f4-86c8-7ec6a587c128",
    "slug": "look-past-the-stars-astronaut-design",
    "title": "Look Past the Stars Astronaut Design",
    "sha256": "f45e5bc7a5342c2caa038c57d9e8c368255701b801efc734f67f06d82e3f1971",
    "sourceImageId": 299
  },
  "post": {
    "id": "5d1f6f0e-3c0a-4a52-9b0b-8f7f0f3e2c11",
    "designId": "c4e49734-7bb5-46f4-86c8-7ec6a587c128",
    "channel": "pinterest",
    "account": "pinterest:shop-a",
    "variant": "main",
    "externalId": "1234567890",
    "url": "https://www.pinterest.com/pin/1234567890/",
    "linkUrl": null,
    "title": "Look Past the Stars",
    "caption": null,
    "hashtags": ["astronaut", "space"],
    "imageUrl": null,
    "board": "Space Shirts",
    "status": "published",
    "publishedAt": "2026-10-10T09:15:00.000Z",
    "removedAt": null,
    "extra": null,
    "createdAt": "2026-10-10T09:16:02.417Z",
    "updatedAt": "2026-10-10T09:16:02.417Z"
  },
  "created": true
}
```

Omitted optional fields come back as `null`. `design.slug`, `design.sha256` and `design.sourceImageId` are `null` when the design has none.

Example: the pin was taken down. Send the required fields again with `status: "removed"` and `removedAt`. Omitted optional fields (board, title, hashtags) are kept.

```bash
curl -s -X POST http://localhost:3000/api/v1/social-posts \
  -H "Authorization: Bearer $LISTINGS_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"design":{"sha256":"f45e5bc7a5342c2caa038c57d9e8c368255701b801efc734f67f06d82e3f1971"},"post":{"channel":"pinterest","account":"pinterest:shop-a","variant":"main","externalId":"1234567890","url":"https://www.pinterest.com/pin/1234567890/","status":"removed","publishedAt":"2026-10-10T09:15:00Z","removedAt":"2026-10-12T14:00:00Z"}}'
```

This returns **200** with `created: false`, `post.status: "removed"`, `post.removedAt: "2026-10-12T14:00:00.000Z"`, and a newer `post.updatedAt`.

#### GET /api/v1/social-posts

Lists posts, newest `publishedAt` first (ties broken by post `id`, descending). All filters are optional and combine with AND. Unknown or repeated query parameters are rejected with `400`.

| Param | Type | Default | Validation |
|---|---|---|---|
| `sha256` | string | none | 64 hex characters, case-insensitive. Not combinable with `sourceImageId` |
| `sourceImageId` | integer | none | Positive integer. Not combinable with `sha256` |
| `channel` | string | none | One of the channels above |
| `account` | string | none | ≤ 100 characters; exact match |
| `status` | string | none | `published` or `removed` |
| `since` | timestamp | none | ISO-8601 with timezone; `publishedAt >= since` |
| `until` | timestamp | none | ISO-8601 with timezone; `publishedAt <= until`. `since` must not be after `until` |
| `q` | string | none | Trimmed, 1-200 characters. Case-insensitive substring match on post title, post caption or design title |
| `page` | integer | `1` | ≥ 1 |
| `limit` | integer | `50` | 1-200 |

A `sha256` or `sourceImageId` that matches no design returns an empty list, not `404`.

Because `+` in a query string means a space, URL-encode it as `%2B` in timezone offsets (`2026-10-01T00:00:00%2B02:00`). `Z` needs no encoding.

```bash
curl -s -H "Authorization: Bearer $LISTINGS_API_TOKEN" \
  'http://localhost:3000/api/v1/social-posts?channel=pinterest&since=2026-10-01T00:00:00Z&limit=50'
```

Response, **200**:

```json
{
  "data": [
    {
      "post": { "id": "5d1f6f0e-3c0a-4a52-9b0b-8f7f0f3e2c11", "designId": "c4e49734-7bb5-46f4-86c8-7ec6a587c128", "channel": "pinterest", "...": "same shape as post in the POST response" },
      "design": {
        "id": "c4e49734-7bb5-46f4-86c8-7ec6a587c128",
        "slug": "look-past-the-stars-astronaut-design",
        "title": "Look Past the Stars Astronaut Design"
      }
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1 }
}
```

`total` counts all matching posts, not only the current page. Request the next page with `page=2` until `page * limit >= total`.

#### GET /api/v1/social-posts/summary

Counts posts per channel, account and status. Accepts only `since` and `until` (same rules as above, applied to `publishedAt`). Combinations with no posts are omitted. Rows are sorted by channel, account, status.

```bash
curl -s -H "Authorization: Bearer $LISTINGS_API_TOKEN" \
  'http://localhost:3000/api/v1/social-posts/summary?since=2026-10-01T00:00:00Z'
```

Response, **200**:

```json
{
  "data": [
    { "channel": "pinterest", "account": "pinterest:shop-a", "status": "published", "count": 41 },
    { "channel": "pinterest", "account": "pinterest:shop-a", "status": "removed", "count": 2 }
  ]
}
```

#### Social posts errors

Errors use the same envelope as the listings API: a string `error` plus `code`, and `field` or `details` when they apply.

```json
{"error":"Expected one of: pinterest, bluesky, mastodon, instagram, threads, reddit, tiktok, youtube, x, linkedin","code":"VALIDATION","field":"post.channel"}
{"error":"Removed post cannot be published again","code":"CONFLICT","details":{"postId":"5d1f6f0e-3c0a-4a52-9b0b-8f7f0f3e2c11"}}
```

| Status | code | Meaning |
|---|---|---|
| 400 | VALIDATION | Invalid JSON; unknown field or query parameter; duplicate query parameter; a malformed, oversized or `null` value; `url` host not on the channel's domain; `removedAt` missing for `removed` or sent with `published`; both `sha256` and `sourceImageId` in a GET |
| 401 | UNAUTHORIZED | Missing or wrong bearer token |
| 404 | NOT_FOUND | POST: no design matches `sha256` / `sourceImageId` (`field: "design"`) |
| 409 | CONFLICT | `sha256` and `sourceImageId` identify different designs; post belongs to another design; `removed` to `published`; different `externalId` for the same design, channel, account and variant; concurrent ingest collision (retry) |
| 503 | NOT_CONFIGURED | `LISTINGS_API_TOKEN` unset; or `SUPABASE_SERVICE_ROLE_KEY` missing on Supabase |
| 500 | INTERNAL | Database or runtime failure; details are not returned |

The exact `error` text and `details` of a 409 can differ between PostgreSQL and MySQL (for example, the message for a unique-index collision). Branch on `code` and the status, not on the message.

### Local verification

Unit tests run through the existing Vitest setup. Transaction tests (listings and social posts, `utils/listings-database.test.ts` and `utils/social-posts-database.test.ts`) are explicitly enabled with `LISTINGS_TEST_DATABASES=1` and use only fixed disposable local targets, never deployment environment credentials:

```bash
docker run -d --name design-studio-listings-postgres -e POSTGRES_PASSWORD=listings-test -e POSTGRES_DB=listings_test postgres:17
docker run -d --name design-studio-listings-mysql -e MYSQL_ROOT_PASSWORD=listings-test -e MYSQL_DATABASE=listings_test -p 127.0.0.1:33316:3306 mysql:8.4
# Wait until both databases accept connections.
LISTINGS_TEST_DATABASES=1 npm test -- --exclude '**/.claude/**'
npx tsc --noEmit
npm run lint -- --ignore-pattern '.claude/**' --ignore-pattern '.agents/**'
docker rm -f design-studio-listings-postgres design-studio-listings-mysql
```

PowerShell: set `$env:LISTINGS_TEST_DATABASES = '1'` before the test command. The integration setup replaces the test schemas in those containers; do not put real data in them. It exercises migration upgrades, rollback, identities, mirrors, RLS/grants, nullable Redbubble IDs, multiple accounts, and both database providers. Scraper tests use static fixtures and mocked clients; they make no live marketplace requests.
