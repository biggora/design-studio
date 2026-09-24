# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: buyers.** Visitors to a deployed storefront browsing for designs — they search and filter the catalog, open a design, and click through to a marketplace (Redbubble, TeePublic, …) to purchase. They never transact on the site itself.
- **Operator: the print-on-demand artist.** Deploys the product, fills in their brand and shop config, and lets automated sync maintain the catalog. Configured via `config/config.json` or the `studio` database table; no admin UI exists.

## Product Purpose

Design Studio is a self-hostable, white-label storefront for print-on-demand artists. Each deployment automatically mirrors the artist's marketplace shop into a fast, searchable catalog on their own domain and funnels buyers to the marketplace listing to buy. Success means: buyers discover designs on the artist's site and click through to purchase, and the operator never maintains the catalog by hand — publishing on the marketplace is the only workflow.

## Positioning

A storefront that maintains itself. The artist publishes once on their marketplace; the sync pipeline (Playwright anti-detect browsing with Cheerio JSON-LD fallback, paced requests with jitter, Cloudflare-aware sessions) refreshes the catalog on a schedule. No checkout to operate, no catalog upkeep, and every brand touchpoint is configuration — a claim neighboring portfolio-site templates can't make truthfully.

## Operating Context

- **Operator workflow:** publish designs on Redbubble → scheduled sync (an external scheduler POSTing `/api/sync/redbubble` with the `x-sync-secret` header, or manual `npm run sync:redbubble`) upserts the `designs` table → the storefront reflects the shop. Note: Vercel Cron cannot drive the sync endpoint as-is — it issues GET while the route is POST-only with header auth (see `docs/DEPLOYMENT_AND_CONFIGURATION.md`).
- **Buyer workflow:** land on home (hero carousel, featured designs) → browse/search/filter the `/designs` catalog with pagination → open a design detail → follow a shop link to the marketplace listing → purchase there; share links for social redistribution.
- **Deployment:** Vercel (with cron) or Docker; database is Supabase (PostgreSQL, default) or MySQL via `DATABASE_PROVIDER`; all brand, domain, social, and marketplace-link settings are runtime config.
- **Sync reality:** Redbubble sits behind Cloudflare. Browser mode may require one manual challenge pass persisted to a storage-state file; serverless environments cannot hold persistent browser sessions, so the Playwright runner prefers a machine/VM. Cheerio fallback trades coverage for simplicity.

## Capabilities and Constraints

Confirmed functionality: catalog with search, collection filter, and pagination; design detail pages with marketplace shop links and social share links; home hero carousel and featured designs; about / services / contact (form) / privacy-policy / terms-of-service pages; cookie-consent banner gating Google Analytics; dynamic `sitemap.xml`; per-page OpenGraph metadata; sync API guarded by `SYNC_SECRET`; dual-database facade (`utils/database.ts` is the only data-access path; server components by default).

Constraints: no on-site checkout — purchases happen on external marketplaces; Redbubble is the only sync source in the codebase today (TeePublic and Tostadora exist as link-out config fields; marketplace logos ship for Redbubble, TeePublic, Amazon, Temu, Tostadora, Zazzle); sync fidelity depends on Redbubble's page structure and JSON-LD; placeholder values in `config/config.json` (example.com, via.placeholder.com) are not brand commitments.

## Brand Commitments

- The product name is **Design Studio** — a distinct product name, separate from any deployment's shop name (confirmed during init).
- White-label by design: each deployment carries the artist's own brand entirely through config. No palette, typography, voice, or visual identity is binding at the product level.

## Evidence on Hand

- Reference deployment shops ([docs/MY_SHOPS.md](docs/MY_SHOPS.md)): Redbubble `redbubble.com/people/ThreadQuirk/shop`, TeePublic `teepublic.com/user/threadquirk`.
- Marketplace logo SVGs and hero-carousel slides in `public/images`.
- Technical documentation set in [docs/](docs/) (architecture, database, sync system, frontend, deployment — in English).
- 18 unit tests in `lib/utils.test.ts` (`npm test`); a verified production build of all 11 routes (route set unchanged since the v0.1.0 release plan).
- **Absences future work must not fabricate:** no real testimonials, customers, or usage numbers; no filled-in brand identity (logo, banner, domain are placeholders); no live product screenshots beyond the local carousel slides; no pricing or licensing claims.

## Product Principles

1. **The catalog is the storefront.** A buyer's path from landing to a marketplace listing stays as short as possible.
2. **Self-maintaining by default.** Publishing on the marketplace is the operator's only job; the site stays truthful without manual upkeep.
3. **White-label at the core.** Identity lives in configuration, never hardcoded; no surface may assume one artist's brand.
4. **Funnel, don't transact.** The site routes purchases to marketplaces and never owns checkout.
5. **Portability over lock-in.** Dual database providers and plain deployment targets keep each deployment the artist's own.
