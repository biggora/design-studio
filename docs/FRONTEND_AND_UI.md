# Frontend, UI, and the Design-Token System

## 1. Page Hierarchy and Route Map

The frontend is built on **Next.js 16 App Router** and **React 19**. Every page is a Server Component (RSC) by default, which keeps the client JavaScript bundle small, first contentful paint fast, and crawler indexing perfect. Client Components (`"use client"`) appear only where interactivity demands them (see [ARCHITECTURE.md](./ARCHITECTURE.md), section 3).

### 1.1 Routing Map
```
app/
├── layout.tsx                     # Root layout (Header, Footer, CookieBanner, ConfigContext, theme + analytics injection)
├── page.tsx                       # "/"            Home (hero Carousel, intro band, Featured Designs)
├── sitemap.ts                     # "/sitemap.xml" Dynamic sitemap (static routes + up to 50,000 design URLs)
├── robots.ts                      # "/robots.txt"  Crawler rules (allow all, disallow /api/, link to sitemap)
├── designs/
│   ├── page.tsx                   # "/designs"     Full catalog with search, collection filter, pagination
│   └── [slug]/
│       └── page.tsx               # "/designs/[slug]" Single design detail page (redirects legacy UUID URLs)
├── about/
│   └── page.tsx                   # "/about"        About the studio and the creative process
├── services/
│   └── page.tsx                   # "/services"     Custom design and printing services
├── contact/
│   └── page.tsx                   # "/contact"      Contact information and contact form
├── privacy-policy/
│   └── page.tsx                   # "/privacy-policy" Privacy policy and cookie usage
├── terms-of-service/
│   └── page.tsx                   # "/terms-of-service" Terms of service
└── api/sync/redbubble/
    └── route.ts                   # "/api/sync/redbubble" Sync endpoint (guarded by x-sync-secret)
```

---

## 2. Key UI Components

Feature components live in `app/components/`; reusable design-system primitives live in `components/ui/` (section 4.3). Feature components are composed, not inherited, and they consume colors exclusively through token classes.

```mermaid
graph TD
    RootLayout["RootLayout (app/layout.tsx)"] --> ContextWrap["ContextWrapper (app/wrapper.tsx)"]
    ContextWrap --> HeaderComp["Header.tsx"]
    ContextWrap --> MainArea["<main> (Active Route)"]
    ContextWrap --> FooterComp["Footer.tsx"]
    ContextWrap --> CookieComp["CookieBanner.tsx"]

    MainArea -->|Route: /| HomePage["app/page.tsx"]
    HomePage --> CarouselComp["Carousel.tsx"]
    HomePage --> FeaturedHome["FeaturedDesigns.tsx"]

    MainArea -->|Route: /designs| CatalogPage["app/designs/page.tsx"]
    CatalogPage --> SearchBar["CatalogSearchBar.tsx"]
    CatalogPage --> DesignGrid["Grid of DesignCard.tsx"]

    MainArea -->|Route: /designs/[slug]| DetailsPage["app/designs/[slug]/page.tsx"]
    DetailsPage --> ShareBox["ShareLinks.tsx"]
    DetailsPage --> ShopBox["ShopLinks.tsx"]
    DetailsPage --> RelatedGrid["FeaturedDesigns.tsx"]

    SearchBar --> UiInput["components/ui Input / Select"]
    DesignGrid --> UiCard["components/ui Card"]
    CookieComp --> UiButton["components/ui Button"]
```

### 2.1 `DesignCard` (`app/components/DesignCard.tsx`)
The storefront's basic building block, composed from the `Card` / `CardContent` primitives:
- **Purpose**: presents one product card in the catalog grid.
- **Details**:
  - `next/image` with `fill`, `aspect-[3/2]` cropping (`object-cover`), and a `sizes` hint (`100vw / 50vw / 33vw`) for responsive loading; falls back to `/images/no_image_available.svg`.
  - The image sits on a `bg-muted` placeholder block while loading.
  - Collection badge line plus a `text-accent hover:underline` "View Design Details" link anchored to the card bottom with `mt-auto`.
  - Title in `text-foreground`, description and collection line in `text-muted-foreground` — no literal colors, no hover transforms (hover is a color/underline change only, per [DESIGN.md](../DESIGN.md)).

### 2.2 `CatalogSearchBar` (`app/components/CatalogSearchBar.tsx`)
The catalog's interactive client-side control, built from the `Input` and `Select` primitives plus a `lucide-react` `Search` icon button:
- **Purpose**: filters designs by search phrase and collection dropdown.
- **Details**:
  - Local state (`search`, `collection`) is kept in sync with the server-provided props via `useEffect`, so navigating with browser back/forward updates the controls.
  - On submit or collection change it builds a fresh `URLSearchParams` (trimmed search, selected collection, always `page=1`) and navigates with `router.push()` wrapped in `useTransition`, resetting pagination to the first page.
  - Idle icons rest at `text-muted-foreground` and shift to `text-accent` on hover.

### 2.3 `Carousel` (`app/components/Carousel.tsx`)
The home-page hero slider, based on `react-slick`:
- **Purpose**: showcase key works in the full-viewport hero section.
- **Details**:
  - Full-bleed slides (`h-[calc(100vh-64px)]`) pulled up under the fixed header with `-mt-16`; each slide is edge-to-edge imagery under a `bg-primary/60` scrim carrying the title/description.
  - Autoplays every 5 seconds with a 500 ms slide transition; the first slide is `priority`-loaded by `next/image`.
  - Dot and arrow colors are restyled from design tokens in `app/globals.css` (`hsl(var(--muted-foreground))` at rest, `hsl(var(--accent))` for active dots and arrows).

### 2.4 `FeaturedDesigns` (`app/components/FeaturedDesigns.tsx`)
A grid of recommended designs:
- **Purpose**: renders the *"Featured Designs"* block on the home page and *"More from this collection"* on the design detail page.
- **Details**: accepts `designs: Design[]` and a section `title`; renders a `grid-cols-1 md:grid-cols-3 gap-6` grid of `DesignCard`s and returns `null` when the list is empty.

### 2.5 `CookieBanner` (`app/components/CookieBanner.tsx`)
The cookie-consent notice (GDPR-style):
- **Pattern — post-mount state (`useState` + `useEffect`)**: consent is read from `localStorage` only after mount, so the server-rendered markup and the first client render match by construction and no hydration mismatch occurs:
  ```typescript
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    try {
      const accepted = localStorage.getItem("cookiesAccepted");
      if (accepted !== "true") {
        setShowBanner(true);
      }
    } catch {}
  }, []);
  ```
- Clicking **Accept** (the `Button` primitive, `size="sm"`) writes `"true"` to `localStorage` and hides the banner instantly, without a reload. The banner is a fixed-bottom `bg-primary` bar with the overlay shadow, including an underlined link to `/privacy-policy`.

### 2.6 `ShopLinks` and `ShareLinks` (`app/components/{ShopLinks,ShareLinks}.tsx`)
External-service integration blocks:
- `ShopLinks`: branded SVG icon links to the author's storefronts (Redbubble, TeePublic, Tostadora) with `sr-only` labels; icons rest at `text-muted-foreground` and hover to `text-accent`.
- `ShareLinks`: share intents for **Facebook, X (Twitter), and Pinterest**, pre-filled with the page URL, share text, and the design image; links are `text-accent` with a `hover:text-secondary` color shift.

### 2.7 `JsonLd` (`app/components/JsonLd.tsx`)
A tiny SSR helper that emits `<script type="application/ld+json">` blocks with `<` escaped to `\u003c` (XSS-safe inline JSON). Used by the root layout (`Organization` + `WebSite`) and the design detail page (`BreadcrumbList` + `CreativeWork`).

---

## 3. SEO Optimization and Metadata

The project is engineered for maximum search visibility in the graphic-design and apparel niche.

### 3.1 Dynamic Metadata Generation (`generateMetadata`)
Every page builds unique meta tags on the server from database data.

#### Catalog page (`app/designs/page.tsx`) — canonical URLs and search-page deindexing:
```typescript
export async function generateMetadata(
  props: {
    searchParams: Promise<{ page?: string; search?: string; collection?: string }>;
  }
): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const currentPage = Number(searchParams.page) || 1;
  // … fetchDesigns(currentPage, …), fetchCollections(), getSiteConfig() …

  const canonicalParams = new URLSearchParams();
  if (selectedCollection) canonicalParams.set("collection", selectedCollection);
  if (currentPage > 1) canonicalParams.set("page", currentPage.toString());
  const canonicalQuery = canonicalParams.toString();
  const canonical = canonicalQuery ? `/designs?${canonicalQuery}` : "/designs";

  return {
    title,
    description,
    keywords: `print-on-demand designs, apparel designs, innovative designs, ${config.name} collection, ${collections.join(", ")}`,
    alternates: { canonical },
    ...(searchQuery ? { robots: { index: false, follow: true } } : {}),
    openGraph: { /* url, type, title, description, images: first 4 design images */ },
  };
}
```
Note the two SEO guards: `?search=…` result pages are marked `noindex, follow`, and the canonical URL is normalized (search dropped, `page` kept only when > 1).

#### Single design page (`app/designs/[slug]/page.tsx`):
- Builds a precise `title` combining the work's name and the brand (`${design.title} - ${config.name} Design`).
- Generates a `description` truncated to 180 characters (`truncateText`).
- Uses the design preview image as `og:image` / `twitter:image`, with `alternates.canonical` on the `designPath(design)` URL (`lib/slug.ts`) — the slug when set, else the UUID.
- Missing records return `title: "Design Not Found"` with `robots: { index: false }` before the page itself calls `notFound()`.

#### Root layout (`app/layout.tsx`):
- `metadataBase` from the configured domain, default title `${config.name} - ${config.intro}`, favicon: a configured `favicon` wins, else a configured `siteLogo`, else the bundled generic set (16/32/apple + `site.webmanifest`).
- Pinterest domain verification (`p:domain_verify`) injected when `verification.pinterest` is set.
- Google Analytics (`@next/third-parties/google`) loaded only when `analytics.google` is configured.
- `viewport.themeColor` set to `#212A31` (Loom Ink) for browser chrome.

### 3.2 Dynamic Sitemap (`app/sitemap.ts`)
`app/sitemap.ts` compiles into a standard sitemap XML:
- Includes all static routes (`/`, `/about`, `/designs`, `/services`, `/contact`, `/terms-of-service`, `/privacy-policy`) with priorities (1.0 down to 0.5) and `changeFrequency: "monthly"`.
- Pages through `fetchDesigns(page, "", "", 100)` in a loop until `total` is reached or the 50,000-URL Google sitemap limit is hit, adding each design URL with its real `lastModified` date (from `createdAt`).

### 3.3 `robots.txt` (`app/robots.ts`)
Generated per deployment from the configured domain:
- `User-Agent: *`, allow `/`, disallow `/api/`.
- Declares the sitemap at `https://<domain>/sitemap.xml` and the canonical host.

### 3.4 Structured Data (JSON-LD)
- Site-wide: `Organization` (name, url, logo, email, `sameAs` social profiles) and `WebSite`, emitted by the root layout via the `JsonLd` component.
- Per design: `BreadcrumbList` (Home → Designs → design) and `CreativeWork` (name, description, image, `dateCreated`, keywords, creator).

---

## 4. Design System and Styling

The visual language is a restrained, content-first aesthetic: dark bands framing a light field, white cards, and a single interactive hue. **This section documents the mechanism; the semantics (token names, roles, named rules) live in [DESIGN.md](../DESIGN.md) — the design system of record.** Nothing below is brand identity: the product is white-label and every visual value is swappable per deployment (see [PRODUCT.md](../PRODUCT.md)).

### 4.1 The Design-Token Layer (`app/globals.css`)
All color and radius authority lives in one `:root` block of HSL-triplet custom properties (Tailwind's `hsl(var(--token))` convention):

```css
:root {
  /* Loom Ink — structural dark: bands, headings, body text */
  --primary: 206 20% 16%;
  --primary-foreground: 132 8% 84%;
  /* Thread Shadow — secondary dark: footer band, button hover */
  --secondary: 210 19% 22%;
  --secondary-foreground: 132 8% 84%;
  /* Indigo Thread — the single interactive hue */
  --accent: 197 70% 24%;
  --accent-foreground: 132 8% 84%;
  /* Warp Grey — muted text and borders; --muted is its light surface tint */
  --muted: 190 12% 90%;
  --muted-foreground: 190 12% 51%;
  /* Linen Mist field */
  --background: 132 8% 84%;
  --foreground: 206 20% 16%;
  /* Card White surfaces */
  --card: 0 0% 100%;
  --card-foreground: 206 20% 16%;
  --popover: 0 0% 100%;
  --popover-foreground: 206 20% 16%;
  /* Semantic status, reserved for form feedback */
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 98%;
  /* Lines and focus */
  --border: 190 12% 51%;
  --input: 190 12% 51%;
  --ring: 197 70% 24%;
  --radius: 0.5rem;
  /* Chart ramp (mapped by Tailwind; no charts in the app yet) */
  --chart-1: 197 70% 24%;
  /* … --chart-2 … --chart-5 */
}
```

This block **is** the theme layer: a deployment re-skins the whole site by overriding it, or by pointing the `themeLink` config key (in `config/config.json` or the `studio` table) at a hosted override stylesheet. `app/layout.tsx` injects that stylesheet only when `isAllowedThemeUrl` accepts it — HTTPS only, hostname restricted to `fonts.googleapis.com`, `cdn.jsdelivr.net`, or `cdnjs.cloudflare.com`.

### 4.2 Tailwind Theme Mapping (`tailwind.config.ts`)
`tailwind.config.ts` maps every token to utility names so components never write a literal value:

| Utility family | Source |
|---|---|
| `bg-primary`, `text-primary-foreground`, … | `hsl(var(--primary))` + `--primary-foreground` |
| `bg-secondary` / `text-secondary` | `hsl(var(--secondary))` (+ foreground) |
| `text-accent`, `bg-accent` | `hsl(var(--accent))` — links, buttons, focus, active dots |
| `bg-muted`, `text-muted-foreground` | `hsl(var(--muted))` / `hsl(var(--muted-foreground))` |
| `bg-background`, `text-foreground` | page field and default text |
| `bg-card`, `text-card-foreground` | card surfaces |
| `border-input`, `ring-ring`, `border-border` | lines and the 2px focus ring |
| `rounded-lg` / `rounded-md` / `rounded-sm` | `var(--radius)` / `calc(var(--radius) - 2px)` / `calc(var(--radius) - 4px)` |

Plugins: `tailwindcss-animate` (transition utilities) and `@tailwindcss/typography` (prose styles). `darkMode: ["class"]` is declared but unused today.

Real usage examples from the codebase:

```tsx
// app/components/Header.tsx — dark band, light links, token-based focus ring
<header className="bg-primary/80 text-primary-foreground shadow-md fixed w-full z-10">
  <Link href="/" className="text-primary-foreground hover:text-muted-foreground …">
  <button className="… focus-visible:ring-2 focus-visible:ring-ring">

// app/components/DesignCard.tsx — accent link on a card
<Link href={designPath(design)} className="text-accent hover:underline mt-auto">

// app/components/CatalogSearchBar.tsx — icon link color shift
<button className="… text-muted-foreground hover:text-accent">
```

### 4.3 UI Primitives (`components/ui/`)
Reusable primitives follow the shadcn convention declared in `components.json` (style `new-york`, `cssVariables: true`, aliases `@/components`, `@/components/ui`, `@/lib/utils`):

| Primitive | API highlights |
|---|---|
| `Button` | CVA-based (`class-variance-authority`); one `variant` (`default`: `bg-accent text-accent-foreground hover:bg-secondary`) and two `size`s (`default`, `sm`); focus `ring-ring`, disabled fades to 50%. Also exports `buttonVariants` so plain links can look like buttons — used for catalog pagination (`buttonVariants({ size: "sm" })`) and the design-detail shop CTA (`buttonVariants({ className: "w-full" })`). |
| `Input` | Styled `<input>`: `border-input bg-card text-foreground`, `placeholder:text-muted-foreground`, `focus-visible:ring-2 ring-ring`. |
| `Textarea` | Same treatment as `Input` with `min-h-[80px]`. |
| `Select` | A **styled native `<select>`** — deliberately not the Radix-based shadcn Select: the project ships no Radix dependency, and the native control keeps the collection filter keyboard- and screen-reader-accessible for free. |
| `Card` | `Card` + `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`; `rounded-lg bg-card text-card-foreground shadow-md`. |

All primitives merge caller classes through `cn()` from `lib/utils.ts` (`clsx` + `tailwind-merge`), so overrides compose predictably:

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 4.4 The No-Hardcode Rule (and its sanctioned exceptions)
Colors enter components only through the token layer — semantic Tailwind classes or the `components/ui` primitives. A repository-wide audit left exactly three literal-value spots:

1. the token definitions themselves in `app/globals.css` (the source of truth);
2. the semantic green/red form-status pair in `ContactForm` (`text-green-800 bg-green-100` / `text-red-800 bg-red-100`), reserved for success/error feedback;
3. `viewport.themeColor` (`#212A31`, Loom Ink) in `app/layout.tsx` — the browser-chrome meta color, which cannot consume a CSS variable.

Everything else was migrated (~130 literal hex values across 20 files), including two off-palette values that moved on-system: services checkmarks are `text-accent` (formerly `green-500`) and about-page body text is `text-foreground` (formerly `gray-700`).

### 4.5 Typography
The single type family is **Inter**, loaded through `next/font/google` (`Inter({ subsets: ["latin"] })` in `app/layout.tsx`) — self-hosted and inlined by Next.js at build time, so no external Google Fonts request blocks rendering. Hierarchy comes from size and weight steps only (Display / Headline / Title / Body / Label — specified in [DESIGN.md](../DESIGN.md)); a deployment can swap the family via the `themeLink` stylesheet hook without breaking the scale.

### 4.6 Design Tooling Sidecar (`.impeccable/`)
- `.impeccable/design.json` — machine-readable design metadata (token ramps, canonical HSL values, schema version) kept in sync with `DESIGN.md`.
- `.impeccable/live/config.json` — configuration for the live visual mode.
