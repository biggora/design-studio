---
name: Design Studio
description: Misty, low-chroma default theme for a white-label print-on-demand storefront — every token swappable per deployment.
colors:
  loom-ink: "#212A31"
  thread-shadow: "#2E3944"
  indigo-thread: "#124E66"
  warp-grey: "#748D92"
  linen-mist: "#D3D9D4"
  card-white: "#FFFFFF"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
  headline:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.11
  title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
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
rounded:
  md: "6px"
  lg: "8px"
spacing:
  sm: "16px"
  md: "24px"
  lg: "32px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.indigo-thread}"
    textColor: "{colors.linen-mist}"
    rounded: "{rounded.md}"
    padding: "8px 24px"
  button-primary-hover:
    backgroundColor: "{colors.thread-shadow}"
  button-secondary:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.indigo-thread}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  link-accent:
    textColor: "{colors.indigo-thread}"
  icon-link:
    textColor: "{colors.warp-grey}"
  icon-link-hover:
    textColor: "{colors.indigo-thread}"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.loom-ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.loom-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: Design Studio

## Overview

**Creative North Star: "The Misty Loom — a calm, atmospheric default skin stretched over a fully configurable chassis."**

The shipped look is misty and atmospheric: a sage-tinted linen field, dark slate bands framing it above and below, white cards floating between them, and one saturated deep-teal thread reserved for every interactive moment. The light is cool and quiet; nothing shouts, and hierarchy comes from tonal steps and size rather than ornament. This is the calm default the product ships with.

The system is a **default theme, not a brand**. Design Studio is a white-label product (see [PRODUCT.md](PRODUCT.md)): every deployment replaces name, logo, palette, and type through configuration. Token authority lives in the `:root` CSS custom properties in `app/globals.css`, consumed through the Tailwind theme mapping in `tailwind.config.ts`; per-deployment theming rides on `config/config.json` (or the `studio` table) and the allow-listed `themeLink` stylesheet hook. Anything visual that cannot be changed from that layer is a defect.

The token layer is complete: every var the Tailwind mapping consumes is defined in `:root` (`--primary`…`--chart-5`, including `--card`, `--border`, `--input`, `--ring`, `--radius`), the old `--muted` drift is closed (`--muted-foreground` is a deep step of the Warp Grey ramp at 34% lightness so muted text passes AA on white (6.8:1) and Linen Mist (4.8:1); muted text on dark bands uses `text-primary-foreground/70…95` instead of the muted token, which would invert the contrast), and components consume token classes (`bg-primary`, `text-accent`, `border-input`, `ring-ring`) — literal colors survive only in three sanctioned places: the token definition file itself, the semantic green/red form-status pair, and the browser-chrome `themeColor` meta value in `app/layout.tsx` (which cannot consume a CSS variable). Reusable primitives live in `components/ui/` (Button, Input, Textarea, Select, Card) on the shadcn convention `components.json` declares.

**Key Characteristics:**

- Misty, low-chroma palette with a single saturated teal reserved for interaction
- Dark bands (header, footer) frame a light field; white cards carry content
- One type family (Inter by default); hierarchy by size and weight only
- Flat surfaces; shadows are structural and constant, never reactive
- Hover is a color shift only; focus is a 2px teal ring
- Fully token-driven and theme-swappable; zero hardcoded brand assumptions

## Colors

A muted, textile-adjacent palette: cool greys and sages in the field, one deep saturated teal doing all the interactive work.

### Primary
- **Indigo Thread** (#124E66): the single interactive color. Links, primary buttons, focus rings, carousel active dots, pagination controls. Its rarity is what makes it read as clickable. (Palette role "primary" is not the `--primary` Tailwind token: in the token layer Indigo Thread maps to `--accent`, while `--primary` carries Loom Ink.)

### Secondary
- **Thread Shadow** (#2E3944): the quieter second dark — footer band and the hover state of primary buttons. Steps between Loom Ink and Indigo Thread without competing with either.

### Neutral
- **Loom Ink** (#212A31): the structural dark. Header band, hero overlay, headings, and body text on light surfaces. The darkest value in the system.
- **Warp Grey** (#748D92): the workhorse muted tone. Secondary text, input borders, icon links on light, and the hover color of links on dark bands.
- **Linen Mist** (#D3D9D4): the page background and the light text on dark bands. A sage-tinted off-white that keeps the field from feeling sterile.
- **Card White** (#FFFFFF): cards, inputs, and selects — pure white surfaces lifted off the Linen Mist field.

Sanctioned exceptions: Tailwind `green-100/green-800` and `red-100/red-800` for contact-form success/error messaging (semantic status colors only, reserved by rule).

### Named Rules
**The No-Hardcode Rule.** Colors enter components only through the token layer (`:root` custom properties consumed via the Tailwind theme mapping). Literal color values are legal in exactly three places: the token definition file, the semantic green/red form-status pair, and the browser-chrome `themeColor` meta value in `app/layout.tsx` (which cannot consume a CSS variable). Nothing else may carry a literal color.

**The One Thread Rule.** Indigo Thread is the only hue that means "interactive." Links, buttons, focus rings, and active states all draw from it; it should stay under ~10% of any screen's pixels. If everything is teal, nothing is clickable.

## Typography

**Display Font:** Inter (with system-ui, -apple-system, sans-serif fallback)
**Body Font:** Inter (same stack) — one family for everything

**Character:** Neutral, quiet, and slightly cool — the type never performs; it measures. Hierarchy is built entirely from size and weight steps, so a deployment can swap the family (via the `themeLink` stylesheet hook) without breaking the scale.

### Hierarchy
- **Display** (700, 3rem, line-height 1): hero carousel titles over imagery; the largest voice on the site.
- **Headline** (700, 2.25rem, line-height 1.11): page-level H1s ("Our Designs", "About …") on light fields.
- **Title** (600–700, 1.5–1.875rem, line-height 1.33): section H2s and the design-detail H1.
- **Body** (400, 1rem, line-height 1.5): descriptions, paragraphs, nav items; secondary body text steps up to 1.25rem for hero subtitles.
- **Label** (400, 0.875rem, line-height 1.43): footer links, cookie-banner copy, copyright line.

### Named Rules
**The Single Family Rule.** One family at a time across all roles. Weight and size do the differentiating; no secondary or accent face unless a deployment's theme config introduces one.

## Layout

A fixed dark header (64px tall, full width, z-10) with `pt-16` compensation on the content container; content sits in a centered `container` with responsive gutters (16px → 24px at `sm` → 32px at `lg`). The home hero is full-bleed: a 60vh carousel sliding under the header with a Loom Ink overlay at 60% opacity and centered display type. Autoplay respects `prefers-reduced-motion` (off by default for those visitors) and a visible play/pause toggle sits in the hero's bottom-right corner.

Catalog grids flow 1 column → 2 at `sm` (640px) → 3 at `lg` (1024px) with 24px gaps; featured sections use 1 → 3 at `md`. The design-detail page splits into a 2-column card (image | 24px-padded content) at `md`. Vertical rhythm runs on 16/32/48px section spacing; the footer is a 3-column flex-wrap band. Content minimum height keeps the footer down-page (`calc(100vh − 160px)`).

## Elevation & Depth

Depth is tonal first: dark bands frame the light field, white cards lift off Linen Mist, and the hero sits under a dark scrim. Shadows exist but are structural and constant — attached to fixed chrome and card surfaces at rest, identical on hover. Nothing in the system lifts, scales, or gains shadow in response to the pointer.

### Shadow Vocabulary
- **Structural card** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`, Tailwind `shadow-md`): cards and the fixed header — the baseline material shadow.
- **Overlay bar** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`, Tailwind `shadow-lg`): the cookie banner, the one element that floats above everything.

### Named Rules
**The Color-Only Hover Rule.** Hover and focus change color, underline, or opacity — never shadow, scale, or transform. All interactive transitions are `transition-colors` at ~150ms with default easing; the only motion beyond that is the hero carousel (500ms slide, 5s autoplay).

## Shapes

Gently rounded, quiet geometry: cards at 8px radius, controls (buttons, inputs, selects, status banners) at 6px. Icons render as square 24px glyphs, inputs carry 1px Warp Grey borders, and catalog media is cropped to a 3:2 ratio with `object-cover`. No pills, no circles (carousel dots excepted), no sharp-0 radicalism — the soft rectangle is the system's silhouette.

## Components

For each: character first, then shape, color assignment, states, and behavior.

### Buttons
- **Shape:** softly rounded (6px)
- **Primary:** Indigo Thread background, Linen Mist text, 8px/24px padding — used for form submits, pagination, cookie consent
- **Hover / Focus:** background shifts to Thread Shadow on hover (`transition-colors`); 2px Indigo Thread focus ring; disabled fades to 50% opacity
- **Secondary / Outline:** quiet labeled action for external commerce links (e.g. "Buy on Redbubble ↗"): Card White surface, 1px Warp Grey border, 6px radius, Indigo Thread label with a 20px marketplace glyph; hover shifts label and border to Indigo Thread emphasis over a light muted fill — color shift only
- **Trust line:** a one-line muted caption sits under any outbound commerce CTA ("Printed & shipped by our partner — opens in a new tab"); it names the handoff so the exit never surprises

### Links
- **Text links:** Indigo Thread, underline on hover ("View Design Details", collection links, back-links)
- **On dark bands:** Linen Mist text hovering to Warp Grey (header nav, footer links)
- **Icon links:** Warp Grey at rest, Indigo Thread (light field) or Linen Mist (dark bands) on hover; 24px glyphs, `sr-only` labels

### Cards / Containers
- **Corner Style:** 8px radius
- **Background:** Card White, on the Linen Mist field
- **Shadow Strategy:** structural card shadow, constant (see Elevation & Depth)
- **Border:** none — shadow and tonal contrast do the separation
- **Internal Padding:** 16px; detail pages step to 24px
- **Catalog card anatomy:** 3:2 image top, Title-weight name, Warp Grey description and collection line, Indigo Thread "View Design Details" anchored to the card bottom (`mt-auto`)

### Inputs / Fields
- **Style:** Card White background, 1px Warp Grey border, 6px radius, 8px/12–16px padding; select shares the treatment
- **Focus:** 2px Indigo Thread ring, outline suppressed
- **Error / Disabled:** reserved semantic status colors (green/red pairs) exist only in form feedback banners

### Navigation
- **Header:** fixed Loom Ink band at 80% opacity with structural shadow; brand at Title weight on the left; light links hover to Warp Grey; collapses to a hamburger menu below `md` with a near-opaque Loom Ink panel; 2px teal focus-visible rings throughout
- **Footer:** Thread Shadow band, three flex-wrap columns (brand, quick links, social icons), Warp Grey links hovering to Linen Mist

### Hero Carousel (signature)
Full-bleed 60vh slides under the header; each slide is edge-to-edge imagery beneath a 60% Loom Ink scrim carrying centered Display and Body type in Linen Mist / Linen Mist-95. Pagination dots rest at the muted ramp, active at Indigo Thread; arrows at Indigo Thread. A circular scrim play/pause toggle (44px tap target, bottom-right) controls autoplay; autoplay is disabled by default under `prefers-reduced-motion`. When it runs: 5-second cadence, 500ms slide.

### Cookie Banner
Fixed-bottom Loom Ink bar with the overlay shadow; Body-size copy in Linen Mist with an underlined privacy link, and a standard primary button for consent.

## Do's and Don'ts

### Do:
- **Do** source every color from the token layer — `:root` custom properties consumed via the Tailwind theme mapping (`bg-primary`, `text-accent`, `border-input`, `ring-ring`) or the primitives in `components/ui/`.
- **Do** keep every deployment-specific value (name, logo, favicon, social links, theme stylesheet) in `config/config.json` or the `studio` table — never inside a component.
- **Do** give every interactive element a visible 2px Indigo Thread focus ring (`focus-visible`).
- **Do** crop catalog media to 3:2 with `object-cover` and lazy-load below the fold.
- **Do** treat Inter and this palette as swappable defaults: build against roles (primary, muted, surface), not against specific values.

### Don't:
- **Don't** write a literal hex, rgb, or palette-utility color into a component — the token definition file, the form-status pair, and the `themeColor` meta value are the only sanctioned exceptions.
- **Don't** introduce hues outside the token set; green/red pairs are reserved for form success/error semantics only.
- **Don't** animate hover with elevation, scale, or transform — color shifts and underlines only.
- **Don't** letter-space or uppercase labels; the family runs at natural spacing in sentence case.
- **Don't** bake any single deployment's brand (name, logo, shop, imagery) into a component — the product is white-label and every brand touchpoint is configuration.
