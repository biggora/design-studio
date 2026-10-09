# Analytics (GA4)

The site tracks exactly one thing per visitor: page views and clicks on the
marketplace "Buy" buttons. There is no user id, no fingerprinting and no other
vendor.

## How it is wired

- `@next/third-parties/google`'s `GoogleAnalytics` is mounted by
  `app/components/AnalyticsGate.tsx`, which renders it **only after the visitor
  accepted cookies** (`lib/consent.ts` + the cookie banner). Nothing — not even
  the gtag script — loads before the choice, and declining keeps it off. The
  measurement id comes from the `analytics.google` studio row; production uses
  `G-JMV6GN9YTL`.
- Every marketplace "Buy" button is an `app/components/BuyLink.tsx` client
  island. It renders the same `<a>` as before (same `href`, `target=_blank`,
  `rel="sponsored noopener noreferrer"`, classes and label) and, on click,
  pushes one event through `sendGAEvent`. The handler never blocks navigation
  and never throws: if GA is not loaded (no consent yet, declined, or an ad
  blocker), the click is simply not recorded.

## What is tracked

**Page views** — the standard GA4 `page_view` events, with the traffic source
GA derives itself (a Pinterest visitor arrives as `pinterest.com / referral`).

**`buy_click`** — one event per click on a "Buy on Redbubble" / "Buy on
TeePublic" button, with these parameters:

| Parameter     | Values                              | Meaning                                  |
| ------------- | ----------------------------------- | ---------------------------------------- |
| `platform`    | `redbubble`, `teepublic`            | Marketplace the click leads to           |
| `design_slug` | e.g. `space-cat`                    | Design (falls back to the row UUID when a design predates slugs) |
| `page_type`   | `design`, `landing`                 | `/designs/[slug]` or the Pinterest landing page `/p/[slug]` |
| `position`    | `primary`, `secondary`              | Which of the page's buttons was clicked  |

Example: on `https://threadquirk.lv/p/fix-one-bug-find-two-more-comic-bug-hunt`,
after accepting cookies, clicking "Buy on Redbubble" sends:

```
event:       buy_click
platform:    redbubble
design_slug: fix-one-bug-find-two-more-comic-bug-hunt
page_type:   landing
position:    primary
```

RSS feed item links deliberately carry **no UTM parameters** — Pinterest treats
a changed item link as a new item; channel attribution comes from the referrer,
not the link.

## One-time GA4 setup

In the GA4 property for the production measurement id:

1. **Mark `buy_click` as a key event.** Admin → Events: after the first events
   arrive, toggle `buy_click` on as key event (conversions).
2. **Register the custom dimensions** (Admin → Custom definitions → Create
   custom dimension), all with scope **Event**: `platform`, `design_slug`,
   `page_type`, `position`.
3. **Link Google Search Console** (Admin → Product links → Search Console
   links) so search queries can be compared with the referral channels.
4. **Check Enhanced measurement → Outbound clicks is on** (Admin → Data
   streams → the web stream → Enhanced measurement). It is GA's own
   click-outbound event; `buy_click` adds the per-design, per-button detail on
   top of it.

## Reading the data

Compare channels with an Exploration (Explore → Blank):

1. **Sessions by source**: report or exploration with dimension *Session
   source/medium*, metric *Sessions* — this shows how much arrives from
   `pinterest.com / referral` vs. search vs. elsewhere.
2. **`buy_click` by source and platform**: rows = *Session source/medium*
   (optionally add *Page path* or the `design_slug` dimension), columns =
   `platform`, metric = *Event count* filtered to the `buy_click` event (or
   *Key events* once step 1 of the setup is done). That is the promotion-chain
   answer: which source yields clicks, and to which marketplace.

## Verifying after deploy

Open GA4 → Admin → **DebugView** (or Reports → Realtime), accept cookies on
`https://threadquirk.lv`, click a Buy button — a `buy_click` event with the four
parameters should appear within seconds.
