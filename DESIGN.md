---
name: Design Studio
description: Ember on Graphite — a dark, woven-texture storefront world where one pumpkin-ember orange carries every interactive moment; all tokens swappable per deployment.
colors:
  ember: "#E8862D"
  ember-ash: "#1A1206"
  graphite: "#171B1F"
  basalt-band: "#111418"
  coal-deep: "#0F1215"
  slate-band: "#1C2126"
  panel: "#262C33"
  ash-surface: "#2B3036"
  seam: "#333B43"
  ash: "#9AA6AE"
  bone: "#F2F4F5"
typography:
  display:
    fontFamily: "Poppins, Inter, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 4.6vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Poppins, Inter, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.15
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
    lineHeight: 1.4
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
    backgroundColor: "rgba(232, 134, 45, 0.9)"
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

The world is a near-black graphite field in three tonal bands (field `#171B1F`, alt band `#1C2126`, deepest band `#111418`), framed above by a fixed basalt header and below by a coal footer. Panels sit one tonal step above the field behind 1px hairline seams; nothing is white. One saturated pumpkin-ember orange (#E8862D) does all the interactive work — eyebrows, links, focus rings, the primary button — and two signature textures give the dark its depth: faint concentric thread rings plus a single soft ember glow on the hero and philosophy bands (the `.texture-weave` utility), and a large-offset structural shadow under the framed artwork card. The hero puts the catalog's own product on the first screen: the latest synced design, framed like a gallery piece beside oversized display type.

The system is a **default theme, not a brand**. Design Studio is a white-label product (see [PRODUCT.md](PRODUCT.md)): every deployment replaces name, palette, type, and copy through configuration — the `home.*` studio rows drive the hero copy, philosophy band, and about teaser; the header monogram derives from the configured name's first letter. Token authority lives in the `:root` custom properties in `app/globals.css`, consumed through the Tailwind theme mapping in `tailwind.config.ts`; per-deployment theming rides on `config/config.json` (or the `studio` table) and the allow-listed `themeLink` stylesheet hook. Anything visual that cannot be changed from that layer is a defect.

The token layer is complete: every var the Tailwind mapping consumes is defined in `:root` (including `--surface` for the alt band, `--card`, `--border`, `--input`, `--ring`, `--radius`), and components consume token classes (`bg-primary`, `text-accent`, `border-input`, `ring-ring`). Literal colors survive only in three sanctioned places: the token definition file itself, the semantic green/red form-status pair, and the browser-chrome `themeColor` meta value in `app/layout.tsx` (which cannot consume a CSS variable). Browser chrome carries the world: `color-scheme: dark`, an ember-tinted text selection, an ember caret, and thin token-sourced scrollbars are part of the shipped global CSS. Fonts load through `next/font/google` (Inter as `--font-sans`, Poppins 600/700 as `--font-display`) and reach components through the `font-sans` / `font-display` Tailwind families.

**Key Characteristics:**

- Three graphite bands with hairline seams; panels one tonal step up, never white
- One ember hue means interactive — links, buttons, rings, eyebrows, chips
- Poppins display voice over an Inter body; hierarchy by face, size, and weight
- Woven-thread texture bands and the framed artwork card are the signature surfaces
- Hover and focus are color shifts only; focus is a 2px ember ring
- Fully token-driven and theme-swappable; zero hardcoded brand assumptions

## Colors

A dark, low-chroma graphite world with a single warm saturated accent doing every interactive job.

### Primary
- **Ember** (#E8862D): the single interactive color. Links, primary buttons, focus rings, chips, eyebrows, value-card numerals. Dark text sits on it (**Ember Ash** #1A1206); its rarity — under ~10% of any screen — is what keeps it readable as "clickable". (Palette role "primary" is not the `--primary` Tailwind token: in the token layer Ember maps to `--accent`/`--ring`, while `--primary` carries the Basalt band dark.)

### Secondary
- **Coal Deep** (#0F1215): the deepest band — footer, philosophy band, and the darkest backdrop. Steps below the field without going pure black.

### Neutral
- **Graphite** (#171B1F): the page field. Body background, chip surface, and the base the textures sit on.
- **Basalt Band** (#111418): the structural dark — fixed header band (at 90% opacity), hero overlays, `--primary`.
- **Slate Band** (#1C2126): the alt band one step above the field — the featured-prints band (`--surface`).
- **Panel** (#262C33): cards, inputs, selects, the framed artwork card (`--card`).
- **Ash Surface** (#2B3036): the muted fill — outline-button hover, scrollbar hover (`--muted`).
- **Seam** (#333B43): hairline borders and input strokes (`--border`/`--input`).
- **Ash** (#9AA6AE): secondary text and placeholder — deep enough to pass AA on Panel and Graphite (`--muted-foreground`).
- **Bone** (#F2F4F5): headings and body text on dark surfaces, and the light text on dark bands (`--foreground`/`--primary-foreground`).

Sanctioned exceptions: Tailwind `green-100/green-800` and `red-100/red-800` for contact-form success/error messaging (semantic status colors only, reserved by rule).

### Named Rules
**The No-Hardcode Rule.** Colors enter components only through the token layer (`:root` custom properties consumed via the Tailwind theme mapping). Literal color values are legal in exactly three places: the token definition file, the semantic green/red form-status pair, and the browser-chrome `themeColor` meta value in `app/layout.tsx` (which cannot consume a CSS variable). Nothing else may carry a literal color.

**The One Ember Rule.** Ember is the only hue that means "interactive." Links, buttons, focus rings, chips, and active states all draw from it; it should stay under ~10% of any screen's pixels. If everything glows orange, nothing is clickable.

**The Hairline Rule.** Dark surfaces separate by tonal step plus a 1px Seam border — never by white cards, never by thick strokes. A panel and its field must differ by exactly one step.

## Typography

**Display Font:** Poppins 600/700 (loaded via `next/font` as `--font-display`, with Inter and system fallbacks) — the geometric display voice for headings and card titles.
**Body Font:** Inter (loaded as `--font-sans`, with system fallbacks) — every sentence, label, and control.

**Character:** Poppins gives the headlines their rounded, confident geometry; Inter keeps the reading quiet and precise. The pairing is two voices, strictly cast.

### Hierarchy
- **Display** (700, clamp(2.25rem → 3.75rem), line-height 1.05, tracking −0.02em): the hero H1 and page H1s; the largest voice on the site.
- **Headline** (700, 2.25rem, line-height 1.15): section H2s on bands ("Featured Designs", "Driven by purpose").
- **Title** (600–700, 1.5rem, line-height 1.3): card titles and secondary headings.
- **Body** (400, 1rem, line-height 1.5): descriptions, paragraphs, nav items; secondary body text in Ash.
- **Label** (400, 0.875rem, line-height 1.43): footer links, cookie-banner copy, captions, counts (tabular numerals).
- **Eyebrow** (600, 0.75rem, letter-spacing 0.14em, uppercase, Ember): the small accent label above a display heading. Used sparingly — hero and section openers only, never on ordinary content.

### Named Rules
**The Two-Voice Rule.** Poppins sings only in headings and card titles (`font-display`); Inter speaks all body copy, controls, and labels. No third family unless a deployment's theme config introduces one.

## Layout

A fixed dark header (64px tall, full width, z-10, Basalt at 90% opacity) with `pt-16` compensation on the content container; content sits in a centered `container` with responsive gutters (16px → 24px at `sm` → 32px at `lg`). The homepage runs in vertical movements: **texture hero** (2-column at `lg` — copy column with eyebrow, display H1, muted paragraph, primary CTA + text link, labeled search form; framed artwork card right, caption strip under a hairline rule) → **chip band** (1px-seam-bordered strip holding the "Browse by interest" and "Gift ideas" navs, capped at six chips + "See all" links each) → **featured band** (Slate Band, centered eyebrow + headline, latest five designs in a 1 → 2 (`sm`) → 3 (`lg`) grid) → **philosophy band** (Coal Deep with texture, four numbered value cards in a 1 → 2 → 4 grid) → **about teaser** (field background, copy + bordered point tiles left, framed artwork right). Search keeps its stable position inside the hero column — never inside rotating or framed imagery. Catalog grids keep the ladder 1 → 2 (`sm`) → 3 (`md`) → 4 (`lg`) → 5 (`xl`) with 24px gaps. The design-detail page splits into a 2-column card (media on the design's baked background | vertically centered info column) at `md`. Vertical rhythm runs on 16/32/48px section spacing; band sections breathe at 64px top/bottom.

## Elevation & Depth

Depth is tonal first — bands step down (field → alt band → deepest band), panels step up — and structural second: shadows are large-offset, low-alpha, and constant, never reactive.

### Shadow Vocabulary
- **Structural card** (Tailwind `shadow-md`): cards and the fixed header — the baseline material shadow.
- **Framed artwork** (Tailwind `shadow-xl`, `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): the framed artwork card only — the one element allowed to lift like a gallery piece.
- **Overlay bar** (Tailwind `shadow-lg`): the cookie banner, the only element floating above everything.

### Named Rules
**The Color-Only Hover Rule.** Hover and focus change color, fill, or underline — never shadow. The single sanctioned transform is the design-card image zoom: hovering a card scales its media to 140% inside the clipped tile (300ms ease-out, collapsed under `prefers-reduced-motion`). Everything else stays a color shift; all other interactive transitions are `transition-colors` at ~150ms; the primary button dims to 90% ember, the outline button fills to Ash Surface, links underline.

## Shapes

Quiet geometry, one notch softer than the old default: cards and framed media at 12px (`--radius`), buttons/inputs/chips at 10px, small focus plates at 8px. Icons render as 16–24px glyphs; inputs carry 1px Seam borders. The framed artwork card wraps its media in a padded, 12px-rounded inset tile — media itself is never cropped. No pills, no circles (header monogram tile and carousel dots excepted) — the soft rectangle is the system's silhouette, and hairlines do the outlining.

## Components

For each: character first, then shape, color assignment, states, and behavior.

### Buttons
- **Shape:** softly rounded (10px)
- **Primary:** Ember background, Ember Ash text, 8px/24px padding — hero CTA, form submits, pagination, cookie consent
- **Hover / Focus:** background dims to 90% ember (`transition-colors`); 2px Ember focus ring; disabled fades to 50% opacity
- **Secondary / Outline:** the quiet commerce and card action ("Buy on TeePublic ↗", "View design →"): Panel surface, 1px Seam border, 10px radius, Ember label with a 16–20px glyph; hover shifts border to Ember emphasis over an Ash Surface fill — color shift only
- **Trust line:** a one-line muted caption sits under any outbound commerce CTA ("Printed & shipped by our marketplace partner…"); it names the handoff so the exit never surprises

### Links
- **Text links:** Ember, underline on hover with 3px underline offset
- **On dark bands:** Bone at 70% resting, Ember or full Bone on hover/active
- **Icon links:** Ash at rest, Ember on hover on the field, Bone on dark bands (`variant="band"`); 24px glyphs, `sr-only` labels

### Chips
- **Style:** Graphite fill, 1px Seam border, 10px radius, 44px min tap target, Ember label; collection counts follow in Ash with tabular numerals and a real gap (flex layouts eat whitespace — use `ml-1`)
- **State:** `selected` marks the active collection with `aria-current`

### Cards / Containers
- **Corner Style:** 12px radius, 1px Seam border (the border is part of the card language now)
- **Background:** Panel, on the field or band it sits on
- **Shadow Strategy:** structural `shadow-md`, constant; the framed artwork card alone lifts with `shadow-xl`
- **Internal Padding:** 16px; detail pages step to 24px
- **Design-card anatomy:** padded inset media tile (portrait 3:4, `object-contain` over the design's baked background color, never cropped at rest), Poppins title (2-line clamp), Ash collection caption, Ash description (3-line clamp), outline "View design →" action anchored to the card bottom (`mt-auto`). Hovering the card zooms the media to 140% inside the clipped tile. The image tile is decorative (`aria-hidden`, non-focusable); the title and action are the accessible links.

### Inputs / Fields
- **Style:** Panel background, 1px Seam border, 10px radius, 8px/12–16px padding; select shares the treatment
- **Focus:** 2px Ember ring, outline suppressed; ember caret in all fields
- **Error / Disabled:** reserved semantic status colors (green/red pairs) exist only in form feedback banners

### Navigation
- **Header:** fixed Basalt band at 90% opacity with structural shadow; brand is the configured `siteLogo` asset in the standard tile (falling back to a monogram tile from the configured name's first letter — never a hardcoded mark) plus the name in Poppins; light links rest at 70% Bone and hover to Ember; collapses to a hamburger menu below `md` with a near-opaque Basalt panel; 2px focus-visible rings throughout
- **Footer:** Coal Deep band, three flex-wrap columns (brand + tagline, quick links, social icons), links at 70% Bone hovering to full Bone

### Framed Artwork Card (signature)
A Panel frame (12px radius, Seam border, `shadow-xl`) holding a rounded inset tile of the design's baked background color with the mockup contained uncropped, closed by a hairline rule and a centered Ash caption. One per hero; it links to the design detail (decorative link, title carried by context). This is the world's proof that the catalog is the storefront.

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

The 2px ember focus ring itself is the shared `focusRingClasses` string (`lib/utils.ts`) — compose it onto any interactive element instead of re-rolling the three focus-visible utilities.

Primary and secondary/outline buttons stay on `components/ui/button.tsx`; the outline variant is the documented quiet commerce and card action.

## Do's and Don'ts

### Do:
- **Do** source every color from the token layer — `:root` custom properties consumed via the Tailwind theme mapping (`bg-primary`, `text-accent`, `border-input`, `ring-ring`, `bg-surface`) or the primitives in `components/ui/`.
- **Do** keep every deployment-specific value (name, logo via `siteLogo`, hero copy, philosophy band, buy links, theme stylesheet) in `config/config.json` or the `studio` table — never inside a component.
- **Do** give every interactive element a visible 2px Ember focus ring (`focus-visible`), and let the global CSS carry the browser chrome: `color-scheme: dark`, ember selection and caret, thin token scrollbars.
- **Do** frame catalog media in a portrait 3:4 inset tile with `object-contain` over the design's baked background color — nothing is ever cropped.
- **Do** treat Poppins, Inter, and this palette as swappable defaults: build against roles (primary, muted, surface), not against specific values.

### Don't:
- **Don't** write a literal hex, rgb, or palette-utility color into a component — the token definition file, the form-status pair, and the `themeColor` meta value are the only sanctioned exceptions.
- **Don't** introduce hues outside the token set; Ember is the only interactive hue, and green/red pairs are reserved for form success/error semantics only.
- **Don't** animate hover with elevation, shadow, or decorative transforms — color shifts, fills, underlines, and the single sanctioned design-card image zoom only.
- **Don't** put Poppins into body copy, controls, or labels — the display voice sings only in headings and card titles.
- **Don't** sprinkle eyebrows onto ordinary content or stack white surfaces on the graphite field — panels are Panel-colored, one step up, behind a hairline.
- **Don't** bake any single deployment's brand (name, monogram text, shop, imagery, hero copy) into a component — the product is white-label and every brand touchpoint is configuration.
