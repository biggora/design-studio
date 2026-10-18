---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

# Surface brief — home (`app/page.tsx`)

## Scope and mode

Home page of the storefront. Mode: Persuade (the visitor decides and acts — finds a print, opens it, buys on the marketplace). World replacement applies site-wide through tokens; this brief owns the home route's composition.

## Audience, job, action, proof, constraints

- **Audience:** international, English-speaking buyers hunting niche-interest prints (dev humor, Halloween, pets, gifts).
- **Job:** within seconds understand what this shop sells, believe the artwork is original and worth clicking through for, and reach either search, a collection, or a design detail.
- **Action:** search, follow a collection/gift chip, open a design detail.
- **Proof:** the artwork itself (real synced designs), truthful POD claims (printed on demand, no fabricated testimonials or numbers).
- **Constraints:** no on-site checkout; affiliate disclosure must stay next to buy CTAs (detail page); white-label — brand copy arrives via config (`home.*` studio rows, config.json defaults), never hardcoded; search keeps a stable, above-the-fold position; interest/gift chips keep their internal-linking role; two primary goals: fast discovery + organic visibility; free/self-hosted solutions only.

## Chosen direction and memorable moment

**User-pinned direction** (approved mockup provided by the operator on 2026-10-18; no seed roll — a brief-pinned direction beats the deal): *Ember on Graphite* — near-black graphite world with woven-thread texture bands and a single pumpkin-ember orange (#E8862D) carrying every interactive moment. Poppins display voice over Inter body. Memorable moment: the hero pairs oversized display type ("…weave stories." with the ember word) against a framed real-artwork card lifted off the texture — the catalog's own product is the hero image.

## Direction contract

THESIS: The catalog's own artwork is the storefront's hero; the category-default arrangement refused is a stock marketing banner carousel that shows everything except the product.

OWN-WORLD: Graphite fields (#171B1F base, #1D2227 alt band, #111417 deepest band) framed by subtle woven-ring texture and one soft ember glow; white cards are gone — panels sit one tonal step above the field with 1px graphite borders; a single ember orange owns eyebrows, links, focus rings, and the primary button (dark text on ember); Poppins 600/700 display, Inter body; ghost outline buttons carry secondary actions.

STORY: The visitor reads "original POD artwork for niche communities," sees a real print framed like a gallery piece, searches or follows a chip, and lands on a detail page that continues the same dark world.

FIRST VIEWPORT: Desktop 2-column hero inside the texture band — left column: ember eyebrow, 3-line display H1 (accent-colored last word), one muted paragraph, primary CTA + ghost collections link, compact labeled search form; right column: framed artwork card (real latest design on its baked background, caption strip under a hairline rule). Primary action sits left-bottom of the copy block; nothing else competes above the fold.

FORM: User-pinned via the approved mockup (code-led build; the pinned mockup rides to the finish review as the critique reference). No seed key — pinned direction replaces the roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved decisions

- Exact studio copy for the deployment's hero/eyebrow/values (defaults ship generic; operator overrides via studio rows).
- Whether the deployment wants the carousel config (`slides`) retired or kept for other deployments (kept in code, unused on home).
