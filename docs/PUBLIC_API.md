# Public Prints API

## 1. Purpose

`/api/v1/*` is a public, unauthenticated, read-only JSON API that exposes the synced design catalog so **another website** can fetch prints from the browser and render them as referral/ad blocks that link straight to the artist's Redbubble listing. It has no write operations, no auth, and returns only a curated subset of each design's fields (see §4).

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

Response body:

```json
{
  "items": [ /* PublicPrint[] — see §4 */ ],
  "page": 1,
  "limit": 12,
  "total": 137
}
```

Status codes: `200` on success, `500` (`{"error":"Internal server error"}`) if the database query throws.

Cache-Control: `public, s-maxage=300, stale-while-revalidate=600` (5-minute CDN cache, 10-minute stale-while-revalidate) on success; `no-store` on error responses.

### 3.2 `GET /api/v1/prints/random`

Random sample of prints, for rotating referral widgets.

| Param | Type | Default | Range / limits |
|---|---|---|---|
| `limit` | integer | `3` | Clamped to `1`–`12`; missing/non-numeric/non-integer falls back to the default. |
| `collection` | string | `""` | Trimmed, then truncated to 100 characters. Exact match against a collection title. When empty, no collection filter is applied (all designs are eligible). |

Response body:

```json
{
  "items": [ /* PublicPrint[] — see §4, length <= limit */ ]
}
```

There is no `page`/`total` — this endpoint is a single random draw, not a paginated list.

Status codes: `200` on success, `500` (`{"error":"Internal server error"}`) if the query throws.

Cache-Control: always `no-store` — random results are never cached (each request re-rolls the sample).

### 3.3 `GET /api/v1/prints/{id}`

A single print by its internal `id`.

| Param | Type | Default | Range / limits |
|---|---|---|---|
| `id` (path) | string | — | Rejected with `400` if longer than 100 characters. No other format validation. |

Response body:

```json
{
  "item": { /* PublicPrint — see §4 */ }
}
```

Status codes:
- `200` — found.
- `400` — `{"error":"Invalid id"}` when the id exceeds 100 characters.
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

---

## 4. `PublicPrint` object

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Internal design id (use this to fetch `/api/v1/prints/{id}`). |
| `title` | string | Design title. |
| `description` | string | Design description (may be an empty string). |
| `imageUrl` | string | Full-artwork image URL, hosted on the Redbubble CDN. |
| `mockupUrl` | string \| null | Classic T-Shirt mockup image URL (`props.mockup_tshirt`), or `null` if not available. |
| `link` | string | Redbubble product page URL — point the referral/ad link here. |
| `collection` | string \| null | Collection title, or `null` when the design has no collection (or its collection is the internal `no_collection` placeholder). |
| `keywords` | string[] | Tags/keywords, split on commas, trimmed, with empty entries removed. `[]` if there are none. |
| `backgroundColor` | string \| null | Dominant background color (e.g. a hex string), or `null` if not set. |

Internal-only fields (`imageName`, `shared`, `price`, `externalId`, etc.) are never included in `PublicPrint`.

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
