---
version: 1
slug: "app-articles-page-tsx"
primary_target: "app/articles/page.tsx"
related_targets: ["app/components/Header.tsx","app/components/Footer.tsx"]
---

# Articles

Visitor mode: Read. Extend the existing storefront world with the precise card-grid format approved by the user.

## Direction contract

THESIS: Help readers choose one useful how-to guide and continue to the full Tumblr article. Each original Facebook cover is the proof of its topic.

OWN-WORLD: Inherit DESIGN.md's Graphite surfaces, Ember links, Poppins headings, Inter body, hairline borders and twelve-pixel card corners. Use the shared page and grid primitives.

STORY: A reader sees practical article topics, recognizes the relevant cover, scans a short introduction and follows Read on Tumblr. The catalog remains accessible in navigation.

FIRST VIEWPORT: Header, Articles H1 and a short lead, followed immediately by three landscape-cover cards on desktop or one on mobile. Each card contains the whole cover, date, title, introduction and Tumblr CTA.

FORM: User-specified responsive card grid, twelve per page; no alternate concept round or seed is needed for this precise approved format. Code-led extension; no approved comp. Quality bar: exact reviewed covers with no text cropping, readable complete titles, real publication dates, direct accessible links, no horizontal overflow.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Asset provenance: Existing Facebook article-share files from pod-video's runtime directory, including reviewed v2 corrections. Reused byte-for-byte on the established CDN; their generation metadata is not rewritten.

## Finish verification — 2026-10-25

Reviewer disposition: ship. Source and `.impeccable/review/desktop.png` / `mobile.png` confirm the approved three-column desktop and single-column mobile card layout; `CardGrid` supplies two columns at `sm`. The five original covers remain uncropped, titles and introductions remain complete, and semantic article cards use the shared typography, palette, hairlines, focus rings and page primitives. Existing cover provenance remains with `docs/ARTICLES.md` and pod-video's runtime records; no raster was generated or altered for this extension. `DESIGN.md` and `.impeccable/design.json` are preserved.

The header menu now collapses below `lg` to accommodate the seventh link; DESIGN.md's navigation statement is updated to match. Footer social icons wrap to avoid overflow in the tablet column. Palette, typography, materials and the token sidecar remain unchanged. Pre-existing documentation drift left untouched: the sidecar's Design Card example scales to 1.04 while the source and guide use 1.4.
