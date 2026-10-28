---
name: Design Studio
description: Ember on Graphite — a dark, woven-texture storefront world where one pumpkin-ember orange carries every interactive moment; all tokens swappable per deployment.
colors:
  ember: "hsl(29 80% 54%)"
  ember-ash: "hsl(33 68% 8%)"
  graphite: "hsl(210 15% 11%)"
  basalt-band: "hsl(210 18% 8%)"
  coal-deep: "hsl(210 16% 7%)"
  slate-band: "hsl(210 15% 13%)"
  panel: "hsl(212 15% 18%)"
  ash-surface: "hsl(210 12% 19%)"
  seam: "hsl(210 14% 23%)"
  ash: "hsl(204 11% 64%)"
  bone: "hsl(200 12% 96%)"
typography:
  display:
    fontFamily: "Poppins, Inter, system-ui, sans-serif"
    fontSize: "2.25rem, 3rem @sm, 3.75rem @xl"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Poppins, Inter, system-ui, sans-serif"
    fontSize: "1.875rem, 2.25rem @sm"
    fontWeight: 700
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Poppins, Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  eyebrow:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.14em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
spacing:
  sm: "16px"
  md: "24px"
  lg: "32px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ember}"
    textColor: "{colors.ember-ash}"
    rounded: "{rounded.md}"
    padding: "8px 24px"
  button-primary-hover:
    backgroundColor: "hsl(29 80% 54% / 0.9)"
  button-outline:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ember}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-outline-hover:
    backgroundColor: "{colors.ash-surface}"
  link-accent:
    textColor: "{colors.ember}"
  chip:
    textColor: "{colors.ember}"
    backgroundColor: "{colors.graphite}"
    borderColor: "{colors.seam}"
    rounded: "{rounded.md}"
    minHeight: "44px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.bone}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.bone}"
    borderColor: "{colors.seam}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: Design Studio

## Overview

**Creative North Star: "Ember on Graphite — the catalog's own artwork glowing on woven graphite."**

The world is a near-black graphite field in three tonal bands (field Graphite, alt band Slate Band, deepest band Coal Deep), framed above by a fixed Basalt header and below by a Coal Deep footer. Panels sit one tonal step above the field behind 1px hairline seams; nothing is white. One saturated pumpkin-ember orange does all the interactive work — eyebrows, links, focus rings, the primary button — and two signature textures give the dark its depth: faint concentric thread rings plus a single soft ember glow on the hero and philosophy bands (the `.texture-weave` utility), and a large-offset structural shadow under the framed artwork card. The hero puts the catalog's own product on the first screen: the latest synced design, framed like a gallery piece beside oversized display type with one ember accent word.

The system is a **default theme, not a brand**. Design Studio is a white-label product (see [PRODUCT.md](PRODUCT.md)): every deployment replaces name, palette, type, and copy through configuration — the `home.*` studio rows drive the hero copy, philosophy band, and about teaser; the brand mark renders the configured `siteLogo` or falls back to a monogram tile derived from the configured name's first letter. Token authority lives in the `:root` custom properties in `app/globals.css` (HSL triplets, Tailwind convention — the frontmatter above mirrors them verbatim), consumed through the Tailwind theme mapping in `tailwind.config.ts`; per-deployment theming rides on `config/config.json` (or the `studio` table) and the allow-listed `themeLink` stylesheet hook. Anything visual that cannot be changed from that layer is a defect.

The token layer is complete: every var the Tailwind mapping consumes is defined in `:root` (including `--surface` for the alt band, `--card`, `--border`, `--input`, `--ring`, `--radius`), and components consume token classes (`bg-primary`, `text-accent`, `border-input`, `ring-ring`). Literal colors survive only in sanctioned places: the token definition file itself, the semantic green/red form-status pair, the light image-blur shimmer in `lib/image.ts`, the browser-chrome `themeColor` meta value in `app/layout.tsx` (`#14181C` — cannot consume a CSS variable), and the satori social-card renderers, which cannot read CSS variables and carry literal mirrors of this palette. Browser chrome carries the world: `color-scheme: dark`, an ember-tinted text selection, an ember caret, and thin token-sourced scrollbars are part of the shipped global CSS. Fonts load through `next/font/google` (Inter as `--font-sans`, Poppins 600/700 as `--font-display`) and reach components through the `font-sans` / `font-display` Tailwind families.

**Key Characteristics:**

- Three graphite bands with hairline seams; panels one tonal step up, never white
- One ember hue means interactive — links, buttons, rings, eyebrows, chips
- Poppins display voice over an Inter body; hierarchy by face, size, and weight
- Woven-thread texture bands and the framed artwork card are the signature surfaces
- Hover and focus are color shifts only; focus is a 2px ember ring
- Fully token-driven and theme-swappable; zero hardcoded brand assumptions

## Colors

A dark, low-chroma graphite world with a single warm saturated accent doing every interactive job. Values below are named after their token roles; the normative HSL values live in `app/globals.css` and in the frontmatter.

### Primary
- **Ember** (`--accent`/`--ring`): the single interactive color. Links, primary buttons, focus rings, chips, eyebrows, value-card numerals. Dark text sits on it (**Ember Ash**, `--accent-foreground`); its rarity — under ~10% of any screen — is what keeps it readable as "clickable". (Palette role "primary" is not the `--primary` Tailwind token: in the token layer Ember maps to `--accent`/`--ring`, while `--primary` carries the Basalt band dark.)

### Secondary
- **Coal Deep** (`--secondary`): the deepest band — footer, philosophy band, and the darkest backdrop. Steps below the field without going pure black.

### Neutral
- **Graphite** (`--background`): the page field. Body background, chip surface, and the base the textures sit on.
- **Basalt Band** (`--primary`): the structural dark — fixed header band (at 90% opacity), mobile buy bar, cookie banner, hero overlays, carousel scrims.
- **Slate Band** (`--surface`): the alt band one step above the field — the featured-prints band.
- **Panel** (`--card`, `--popover`): cards, inputs, selects, the framed artwork card.
- **Ash Surface** (`--muted`): the muted fill — outline-button hover, media-tile fallback, scrollbar hover.
- **Seam** (`--border`/`--input`): hairline borders and input strokes.
- **Ash** (`--muted-foreground`): secondary text and placeholder — deep enough to pass AA on Panel and Graphite.
- **Bone** (`--foreground`/`--primary-foreground`): headings and body text on dark surfaces, and the light text on dark bands.

Sanctioned exceptions: Tailwind `green-100/green-800` and `red-100/red-800` for contact-form success/error messaging (semantic status colors only, reserved by rule); the light `#d3d9d4` blur-shimmer behind loading artwork in `lib/image.ts` (a soft block beats a dark slab while images stream in); the browser-chrome `themeColor` literal; the literal palettes inside the satori renderers (see Components → Social cards).

### Named Rules
**The No-Hardcode Rule.** Colors enter components only through the token layer (`:root` custom properties consumed via the Tailwind theme mapping). Literal color values are legal in exactly four places: the token definition file, the semantic green/red form-status pair, the light blur-shimmer + `themeColor` chrome values, and satori renderers that must mirror the token block as literals because they cannot read CSS variables. Nothing else may carry a literal color.

**The One Ember Rule.** Ember is the only hue that means "interactive." Links, buttons, focus rings, chips, and active states all draw from it; it should stay under ~10% of any screen's pixels. If everything glows orange, nothing is clickable.

**The Hairline Rule.** Dark surfaces separate by tonal step plus a 1px Seam border — never by white cards, never by thick strokes. A panel and its field must differ by exactly one step.

## Typography

**Display Font:** Poppins 600/700 (loaded via `next/font` as `--font-display`, with Inter and system fallbacks) — the geometric display voice for headings and card titles.
**Body Font:** Inter (loaded as `--font-sans`, with system fallbacks) — every sentence, label, and control.

**Character:** Poppins gives the headlines their rounded, confident geometry; Inter keeps the reading quiet and precise. The pairing is two voices, strictly cast.

### Hierarchy
- **Display** (700, 2.25rem stepping to 3rem at `sm` and 3.75rem at `xl`, line-height 1.05 on the hero, tracking −0.02em): the hero H1 and every page H1 (`PageHeader`); the largest voice on the site.
- **Headline** (700, 1.875rem stepping to 2.25rem at `sm`, tracking −0.02em): section H2s on home bands ("Featured Designs", the philosophy opener) and the design-detail H1.
- **Title** (600, 1.5rem, line-height 1.3): section H2s on catalog pages, gift-page sections, contact/shop blocks. Card titles are the same voice scaled down — 1.25rem on index cards, 1.125rem on design cards (2-line clamp).
- **Body** (400, 1rem, line-height 1.5): descriptions, paragraphs, nav items; secondary body text in Ash.
- **Label** (400, 0.875rem, line-height 1.43): footer links, cookie-banner copy, captions, counts (tabular numerals), the `/p/` landing title (semibold, 2-line clamp).
- **Eyebrow** (600, 0.75rem, letter-spacing 0.14em, uppercase, Ember): the small accent label above a display heading. Used sparingly — hero and section openers only, never on ordinary content.
- **Long-form** (prose): policy and disclosure pages render in the typography-plugin `prose` measure (`max-w-prose`, ≈65ch) with `SectionHeading` chapter breaks — the one place the reading measure, not the grid, owns the page.

### Named Rules
**The Two-Voice Rule.** Poppins sings only in headings and card titles (`font-display`); Inter speaks all body copy, controls, and labels. No third family unless a deployment's theme config introduces one.

## Layout

A fixed dark header (64px tall, full width, z-10, Basalt at 90% opacity) with `pt-16` compensation on the content container; content sits in a centered `container` with responsive gutters (16px → 24px at `sm` → 32px at `lg`) and a 32px vertical rhythm (`PageShell`); full-width bands breathe at 64px top/bottom (`Band`, default `py-16`). The homepage runs in vertical movements: **texture hero** (2-column at `lg` in a 1.1fr/0.9fr split, 56px→80px padding — copy column with eyebrow, display H1 whose final word takes the Ember accent, muted paragraph, primary CTA + accent text link, labeled search form; framed artwork card right, caption strip under a hairline rule) → **chip band** (a field band closed by 1px Seam borders top and bottom, holding the "Browse by interest" and "Gift ideas" navs, capped at six chips + "See all" links each) → **featured band** (Slate Band, centered eyebrow + headline, the next six designs in a 1 → 2 (`sm`) → 3 (`lg`) grid (two clean rows)) → **philosophy band** (Coal Deep with texture, four numbered value tiles in a 1 → 2 → 4 grid) → **about teaser** (field background, copy + bordered point tiles left, framed artwork right). Search keeps its stable position inside the hero column — never inside rotating or framed imagery.

Catalog pages stack as header → search/filter bar → results, with a mobile-only order twist: on small screens the count line, grid, and interest chips reorder to count → grid → interests → pagination (CSS `order` utilities; the DOM keeps interests → count → grid → pagination for crawlers). Catalog grids keep the ladder 1 → 2 (`sm`) → 3 (`md`) → 4 (`lg`) → 5 (`xl`) with 24px gaps; index pages (collections, gifts) use a 3-up ladder of `IndexCard`s; gift pages repeat titled 8-up sections closed by an accent "See all …" link, then a text FAQ. The design-detail page splits into a 2-column card at `md` — full-bleed media on the design's baked background left, vertically centered info column (24px padding) right — with the related-designs grid below and the sticky mobile buy bar fixed to the viewport bottom. The `/p/` Pinterest landing is a single centered `max-w-md` column: 3:4 media tile, short title, full-width buy buttons, trust line, accent path on to the design page. 404 centers its copy and offers Browse designs / Go home buttons. Vertical rhythm runs on 16/24/32px section spacing.

## Elevation & Depth

Depth is tonal first — bands step down (field → alt band → deepest band), panels step up — and structural second: shadows are large-offset, low-alpha, and constant, never reactive.

### Shadow Vocabulary
- **Structural card** (Tailwind `shadow-md`): cards and the fixed header — the baseline material shadow.
- **Framed artwork** (Tailwind `shadow-xl`, `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): the framed artwork card only — the one element allowed to lift like a gallery piece.
- **Overlay bar** (Tailwind `shadow-lg`): the cookie banner and the mobile buy bar — the only elements floating above page content.

### Named Rules
**The Color-Only Hover Rule.** Hover and focus change color, fill, or underline — never shadow. The single sanctioned transform is the design-card image zoom: hovering a card scales its media to 140% inside the clipped tile (300ms ease-out, collapsed under `prefers-reduced-motion`, as is every transition). Everything else stays a color shift; all other interactive transitions are `transition-colors` at ~150ms; the primary button dims to 90% ember, the outline button fills to Ash Surface with an Ember border, links underline. The mobile buy bar enters by opacity fade only (200ms).

## Shapes

Quiet geometry, one notch softer than the old default: cards and framed media at 12px (`--radius`), buttons/inputs/chips at 10px, small focus plates at 8px, thumbnail tiles at 10px. Icons render as 16–24px glyphs; inputs carry 1px Seam borders. Framed media wraps in a padded, rounded inset tile — media itself is never cropped. No pills, no circles (the carousel's dots and its round pause/play control excepted — slider chrome, not UI language; the brand-mark tile is a 12px soft square) — the soft rectangle is the system's silhouette, and hairlines do the outlining.

## Components

For each: character first, then shape, color assignment, states, and behavior.

### Buttons
- **Shape:** softly rounded (10px)
- **Primary:** Ember background, Ember Ash text, 8px/24px padding — hero CTA, search submit, form submits, pagination, cookie consent; commerce CTAs render it full-width with a 44px min height and a trailing ↗ glyph ("Buy on Redbubble ↗")
- **Hover / Focus:** background dims to 90% ember (`transition-colors`); 2px Ember focus ring; disabled fades to 50% opacity
- **Secondary / Outline:** the quiet commerce and card action ("Buy on TeePublic ↗", "View design →"): Panel surface, 1px Seam border, 10px radius, Ember label with a 16–20px glyph; hover shifts the border to Ember emphasis over an Ash Surface fill — color shift only
- **Buy island:** every outbound commerce anchor is the `BuyLink` client island — `rel="sponsored noopener noreferrer"`, one fire-and-forget GA4 `buy_click` tagged `primary` / `secondary` / `sticky`; analytics can delay nothing
- **Trust line:** a one-line muted caption sits under any outbound commerce CTA ("Printed & shipped by our marketplace partner. We may earn a commission — learn more"), linking to `/disclosure`; it names the handoff so the exit never surprises

### Links
- **Text links:** Ember, underline on hover with 3px underline offset
- **On dark bands:** Bone at 70% resting, Ember or full Bone on hover/active; the active nav item is full Bone semibold with `aria-current`
- **Icon links:** Ash at rest, Ember on hover on the field, Bone on dark bands (`variant="band"`); 24px glyphs, `sr-only` labels, http(s)-sanitized hrefs

### Chips
- **Style:** Graphite fill, 1px Seam border, 10px radius, 44px min tap target, Ember label; collection counts follow in Ash with tabular numerals and a real gap (flex layouts eat whitespace — use `ml-1`)
- **State:** `selected` marks the active collection with `aria-current`
- **Caps:** the home chip band caps each nav at six chips behind "See all" links; the unfiltered catalog caps the always-visible chip list at eight, collapsing the rest behind a native `<details>` disclosure ("Browse all N interests", chevron rotates open) so the grid stays on the first screen — every link stays in the DOM either way

### Cards / Containers
- **Corner Style:** 12px radius, 1px Seam border (the border is part of the card language)
- **Background:** Panel, on the field or band it sits on
- **Shadow Strategy:** structural `shadow-md`, constant; the framed artwork card alone lifts with `shadow-xl`
- **Internal Padding:** 16px; detail pages step to 24px
- **Design-card anatomy:** padded inset media tile (portrait 3:4, `object-cover object-center` filling the tile edge to edge over the design's baked background color; the 2:3 and 4:5 mockups lose only a sliver), Poppins title (2-line clamp, hovers to Ember), Ash collection caption resolved through the curated display-name map (URLs keep the raw collection value), Ash description (3-line clamp), outline "View design →" action anchored to the card bottom (`mt-auto`). Hovering the card zooms the media to 140% inside the clipped tile. The image has the design title as its nonempty alt and is exposed to assistive technology; its duplicate link stays outside the tab order, with the title and action providing keyboard navigation.
- **Index-card anatomy:** the collections/gifts directory card — a 3× strip of the same 3:4 artwork thumbnails over the panel skin, Poppins title, Ash description, optional Ash meta line; the whole card is one link whose border hovers to Ember.
- **Value tile:** philosophy-band card — Ember two-digit numeral (`01`…, Poppins semibold, decorative), Poppins title, Ash body.
- **About point tile:** hairline-bordered flat tile (no fill) with a small semibold title and Ash caption, in a 2-up grid.

### Inputs / Fields
- **Style:** Panel background, 1px Seam border, 10px radius, 8px/12–16px padding; the native `<select>` shares the treatment (Radix was deliberately not adopted — the native control keeps the filter accessible for free), and the textarea adds an 80px min height
- **Search:** the catalog bar pairs the input (with a trailing muted Ember-on-hover submit glyph) and the collection select; the home hero search is a labeled input + primary button pair
- **Focus:** 2px Ember ring, outline suppressed; ember caret in all fields
- **Error / Disabled:** reserved semantic status colors (green/red pairs) exist only in form feedback banners; the "not configured" state uses the muted fill instead

### Navigation
- **Header:** fixed Basalt band at 90% opacity with structural shadow; brand is the configured `siteLogo` asset in the 32px tile (falling back to a monogram tile — the name's first letter on an Ember square — never a hardcoded mark) plus the name in Poppins; light links rest at 70% Bone and hover to Ember; active route goes full-Bone semibold with `aria-current`; collapses to a hamburger menu below `lg` so all seven navigation links fit comfortably, with a near-opaque Basalt panel; 2px focus-visible rings throughout
- **Footer:** Coal Deep band, three flex-wrap columns (brand + tagline, quick links including the Affiliate Disclosure, social icons), links at 70% Bone hovering to full Bone

### Framed Artwork Card (signature)
A Panel frame (12px radius, Seam border, `shadow-xl`, capped at `max-w-md`) holding a padded 12px-rounded inset tile with the mockup uncropped at its own ratio — no fixed aspect box, so the frame hugs the picture edge to edge and nothing ever letterboxes (the hero and about teaser pick the landscape CDN mockup; a taller marketplace fallback would render taller, still bar-free) — closed by a hairline rule and a centered Ash caption. One per hero slot; it links to the design detail with the design title as image alt and remains keyboard-accessible. This is the world's proof that the catalog is the storefront.

### Mobile Buy Bar
Mobile-only (hidden at `md`+) sticky commerce bar fixed to the viewport bottom: Basalt band at 95% over a top Seam border, full-width primary buy CTA (44px min height, ↗ glyph), side safe-area padding respected. It fades in (200ms, opacity only) after the first screen (scroll past ~240px), hides while the in-card CTA (`[data-in-card-buy]`) is on screen so the two never compete, and parks above the cookie banner via its `data-cookie-banner` height. z-40 — below the banner (z-50), above content. Clicks fire as GA4 `buy_click` position `sticky`.

### Media Loading
Artwork streams in over a light gray shimmer (`#d3d9d4` blur placeholder in `lib/image.ts`) — a deliberate light note that reads as "photograph loading", never as a UI surface; display images prefer the synced T-shirt mockup over the watermarked flat art.

### Social cards
Two satori renderers ship images the storefront world cannot style with CSS variables:
- **OG/Twitter cards** (`lib/og.tsx` via `opengraph-image`/`twitter-image` routes): 1200×630 in the world itself — a Graphite field closed by an Ember top bar, Poppins wordmark and title in Bone over Inter copy in Ash, a Panel chip with a Seam border and Ember label, an Ember CTA with dark text, and the artwork (or the Ember brand initial) framed on a Slate Band panel behind a hairline. Their colors are literal mirrors of the token block (satori cannot read CSS variables) — re-sync them when the tokens change.
- **Pinterest pins** (`lib/pin-image.tsx`): 1000×1500 (2:3), artwork-first by design — the design's own baked background fills the card and the title band flips between dark-on-light and white-on-dark by luminance. It takes its color from the artwork, not the brand, and is exempt from the palette.

### Shared page primitives (`app/components/`)
The roles above are encoded once in reusable components — use them instead of re-rolling class strings, so a theme change lands everywhere at once:

- **`AccentLink`** — the accent text link (Ember, underline on hover, 2px ember focus ring) for internal routes.
- **`LinkChip`** — the interest chip into the catalog: bordered soft rectangle, 44px min tap target, `selected` marks the active collection with `aria-current`.
- **`IconLink`** — the 24px social/share glyph: Ash at rest, Ember on hover on the field, Bone on dark bands (`variant="band"`), sr-only label, http(s)-sanitized href.
- **`Eyebrow`** — the uppercase letter-spaced Ember label above display headings; hero and section openers only.
- **`Band`** — the full-width graphite band: `tone` maps field/alt/deep onto the band colors, `texture` adds the woven glow, `contentClassName` overrides the section rhythm (default `py-16`) over the PageShell container.
- **`PageShell`** — the page container: centered `container` with the responsive gutters (16 → 24 → 32px) and 32px vertical rhythm.
- **`PageHeader`** — the page H1 in the Display role with optional lead paragraph.
- **`SectionHeading`** — the section H2: `title` voice (default, 1.5rem/600) for catalog sections, `headline` variant for the home band openers (spacing owned by the wrapper).
- **`CardGrid`** — the card grid rhythm: 24px gaps over a responsive column ladder (`columns={3|4|5}`; 5, the default, is the catalog ladder) with `as="ul"` for index lists.
- **`IndexCard`** — the collections/gifts index link card: DesignThumbs, title, description, optional meta line, panel skin with hover border and the shared focus ring.
- **`DesignThumbs`** — up to three portrait artwork thumbnails repeating the design-card tile treatment inside index cards, each exposed to assistive technology with the design title as image alt.
- **`BrandMark`** — the header/footer brand tile: configured `siteLogo`, falling back to the Ember monogram square when absent or broken.
- **`BuyLink`** — the sponsored outbound commerce anchor with the GA4 `buy_click` island (see Buttons).
- **`BackToCatalog`** — the stateful "← Back to Designs" accent link that returns to the visitor's last catalog search/filter/page.
- **`CollectionLinks`** — the chip nav with counts, `selected` state, and the capped list + native disclosure (see Chips).
- **`MobileBuyBar`** — the sticky mobile commerce bar (see above).
- **`Carousel`** — the config-driven rotating hero with pause control and `prefers-reduced-motion` support; kept for deployments that want it, unused on the home page.

The 2px ember focus ring itself is the shared `focusRingClasses` string (`lib/utils.ts`) — compose it onto any interactive element instead of re-rolling the three focus-visible utilities.

Primary and secondary/outline buttons stay on `components/ui/button.tsx`; the outline variant is the documented quiet commerce and card action.

## Do's and Don'ts

### Do:
- **Do** source every color from the token layer — `:root` custom properties consumed via the Tailwind theme mapping (`bg-primary`, `text-accent`, `border-input`, `ring-ring`, `bg-surface`) or the primitives in `components/ui/`.
- **Do** keep every deployment-specific value (name, logo via `siteLogo`, hero copy, philosophy band, buy links, theme stylesheet) in `config/config.json` or the `studio` table — never inside a component.
- **Do** give every interactive element a visible 2px Ember focus ring (`focus-visible`), and let the global CSS carry the browser chrome: `color-scheme: dark`, ember selection and caret, thin token scrollbars.
- **Do** frame catalog media in a portrait 3:4 inset tile with `object-cover object-center` — the image fills the tile edge to edge, no empty bars; the baked background color shows only while it loads.
- **Do** mirror the token block as literal values inside any satori renderer (they cannot read CSS variables) and re-sync those literals whenever the tokens change.
- **Do** treat Poppins, Inter, and this palette as swappable defaults: build against roles (primary, muted, surface), not against specific values.

### Don't:
- **Don't** write a literal hex, rgb, or palette-utility color into a component — the token definition file, the form-status pair, the blur-shimmer/`themeColor` chrome values, and satori renderers' token mirrors are the only sanctioned exceptions.
- **Don't** introduce hues outside the token set; Ember is the only interactive hue, and green/red pairs are reserved for form success/error semantics only.
- **Don't** animate hover with elevation, shadow, or decorative transforms — color shifts, fills, underlines, and the single sanctioned design-card image zoom only.
- **Don't** put Poppins into body copy, controls, or labels — the display voice sings only in headings and card titles.
- **Don't** sprinkle eyebrows onto ordinary content or stack white surfaces on the graphite field — panels are Panel-colored, one step up, behind a hairline.
- **Don't** bake any single deployment's brand (name, monogram text, shop, imagery, hero copy) into a component — the product is white-label and every brand touchpoint is configuration.
