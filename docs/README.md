# Design Studio — Technical Documentation Portal

Welcome to the technical documentation for **Design Studio** — a self-hostable, white-label storefront for print-on-demand (POD) artists. Each deployment mirrors the artist's marketplace shop into a fast, searchable catalog and funnels buyers to the marketplace listing to purchase. See [PRODUCT.md](../PRODUCT.md) for the product brief and [DESIGN.md](../DESIGN.md) for the design system of record.

---

## 1. Documentation Navigator

| Document | Description | Main topics |
|---|---|---|
| [**System Architecture**](./ARCHITECTURE.md) | Conceptual architecture and application anatomy | Next.js 16 App Router, React 19, Server Components vs Client Components, dual-database abstraction (`utils/database.ts`), configuration merging (`lib/config.ts`), state management (Context + Zustand), design-token theme layer. |
| [**Database and Models**](./DATABASE.md) | Data-storage specification | `studio` and `designs` table schemas for PostgreSQL (Supabase) and MySQL, stored procedures, the API of the `utils/database.ts` module, migration instructions. |
| [**Sync Subsystem**](./SYNC_SYSTEM.md) | The automated Redbubble parsing pipeline | Two-mode parsing (Playwright Chromium vs Cheerio JSON-LD), Cloudflare handling, the `RequestPacer` algorithm with jitter, API protection via `SYNC_SECRET`, upsert logic. |
| [**Frontend and UI Components**](./FRONTEND_AND_UI.md) | User interface, theming, and styling | Route map, UI components (`DesignCard`, `CatalogSearchBar`, `CookieBanner`), the design-token layer in `app/globals.css`, `components/ui` primitives, SEO optimization, dynamic `sitemap.ts` and `robots.ts`. |
| [**Deployment and Configuration**](./DEPLOYMENT_AND_CONFIGURATION.md) | Setup and operations guide | `.env` variable reference, Vercel deployment with cron jobs, running the Playwright sync runner in Docker, troubleshooting captcha and database connectivity. |
| [**Release Plan**](./RELEASE_PLAN.md) | Release readiness and rollout | v0.1.0 release scope, verification checklist, known limitations. Historical record. |
| [**Progress Ledger**](./progress.md) | Working ledger of the documentation-update run | Task table, decisions log, review findings (RV-DOCS), session state. |

Additional root-level documents:

- [PRODUCT.md](../PRODUCT.md) — product truth: audience, positioning, capabilities, and constraints.
- [DESIGN.md](../DESIGN.md) — the design system of record: token names ("Loom Ink", "Indigo Thread", …), the "Misty Loom" north star, and the No-Hardcode Rule.
- [.impeccable/](../.impeccable/) — design tooling sidecars (`design.json` token metadata and the `live/config.json` live visual mode).

---

## 2. Technology Stack Overview

- **Framework**: [Next.js](https://nextjs.org/) `^16.3.6` (App Router, React Server Components, Route Handlers).
- **UI library**: [React](https://react.dev/) `^19.2.4` + [Zustand](https://zustand-demo.pmnd.rs/) `^5.0.2`.
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) `^3.4.1` (dev dependency) with a CSS-custom-property design-token layer in `app/globals.css`, plus `tailwindcss-animate` `^1.0.7` and `@tailwindcss/typography` `^0.5.16` plugins.
- **UI primitives**: `components/ui/` (Button, Input, Textarea, Select, Card) on the shadcn convention declared in `components.json`, built with `class-variance-authority` `^0.7.1`, `clsx` `^2.1.1`, and `tailwind-merge` `^2.5.5` (see `cn()` in `lib/utils.ts`). Icons via `lucide-react` `^0.468.0`.
- **Databases**:
  - [Supabase](https://supabase.com/) (`@supabase/supabase-js` `^2.47.1`) — PostgreSQL, the default provider.
  - [MySQL](https://www.mysql.com/) (`mysql2` `^3.11.0`) — alternative relational provider.
- **Scraping and automation**:
  - [Playwright](https://playwright.dev/) `^1.52.0` — Chromium browser with anti-detect script injection.
  - [Cheerio](https://cheerio.js.org/) `^1.0.0-rc.12` — lightweight JSON-LD / Schema.org microdata parsing.
- **Testing**: [Vitest](https://vitest.dev/) `^3.2.4` with `@vitest/coverage-v8`. `lib/utils.test.ts` holds 18 unit tests (a gitignored worktree copy under `.claude/worktrees/` may double the reported count in some runs).
- **Integrations**: Google Analytics (`@next/third-parties` `^16.3.6`), Simple Icons (`@icons-pack/react-simple-icons` `^10.2.0`), Slick Carousel (`react-slick` `^0.30.2` / `slick-carousel` `^1.8.1`).

---

## 3. Developer Quick Start

### 3.1 Clone and install dependencies
```bash
# Install project packages
npm install

# Install browser binaries for Playwright (needed for catalog sync)
npx playwright install chromium
```

### 3.2 Configure environment variables
Copy the example file and fill in your access settings:
```bash
cp .env.example .env
```
Minimal set for a local run against Supabase:
```env
DATABASE_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
REDBUBBLE_SHOP_URL=https://www.redbubble.com/people/your-username/shop
```

### 3.3 Start the development server
```bash
npm run dev
```
The app is served at [http://localhost:3000](http://localhost:3000).

### 3.4 Run the tests
```bash
# One-shot unit test run
npm test

# Watch mode
npm run test:watch
```

### 3.5 Run catalog sync
```bash
# Background import of products from the Redbubble shop into the database
npm run sync:redbubble
```

Other useful scripts: `npm run build`, `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run prettier` (see `package.json`).

---

## 4. Architectural Principles of the Codebase

1. **Server rendering by default**: every new component is created as a Server Component (RSC) unless it explicitly needs a state hook (`useState`, `useEffect`) or access to a browser API.
2. **Database isolation**: database queries are never written directly in pages — all operations go strictly through the methods of the `utils/database.ts` facade.
3. **Sync security**: sync endpoints must always be protected by strict `SYNC_SECRET` verification (the `/api/sync/redbubble` route checks the `x-sync-secret` request header).
4. **Colors only through the token layer** (the No-Hardcode Rule, defined in [DESIGN.md](../DESIGN.md)): components consume semantic Tailwind classes (`bg-primary`, `text-accent`, `border-input`, `ring-ring`) backed by the `:root` custom properties in `app/globals.css` — never literal color values. The only sanctioned exceptions are the token definitions themselves and the green/red form-status pair in `ContactForm`.
5. **White-label at the core**: every brand touchpoint (name, logo, domain, social links, theme stylesheet via `themeLink`) lives in configuration — `config/config.json` or the `studio` database table — never inside a component.
