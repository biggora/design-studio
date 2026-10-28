# PageSpeed: first-screen images and accessible catalog controls

Approved scope: the four fixes proposed after reviewing the mobile home and catalog reports on 2026-10-28. They support faster print discovery and basic technical SEO without changing the artwork or adding services.

## Baseline and approach

- Home: Performance 96, LCP 2.7 s, Accessibility 100, SEO 92.
- Catalog: Performance 88, LCP 3.8 s, Accessibility 95, SEO 92. Its LCP image used lazy loading; resource load delay was 1660 ms versus 180 ms for the download. These breakdown values are not directly subtractable from simulated LCP.
- Load the catalog's first four cards eagerly with high fetch priority, covering the first two mobile rows. Keep later results lazy. Apply the same priority attributes to the home hero and the remote-image fallback, using the installed Next.js 16 Image API.
- Match `sizes` to the existing Tailwind container caps, gutters, card padding and grid gaps. DesignCard defaults to the five-column catalog ladder; home's three-column featured grid supplies its own sizes. Update these hints if those layouts change. Browser DPR still controls the selected resolution.
- Name the collection select `Filter by collection` and replace the cookie link's `Learn more` with `Privacy policy`.
- Keep immutable CDN images direct; preserve the existing Vercel optimizer rules for remote fallbacks. No changes to image files, data or infrastructure.

## Verification

- Added a regression test rendering the catalog with real card/image components: it failed on the original lazy first-screen images, then passed after the fix. It also checks that later images stay lazy and CDN URLs stay direct.
- Added a real Next.js Image regression check for the eager/high remote fallback.
- Seven targeted test files: 61 tests passed. Scoped ESLint and production build passed. The build reported unavailable article publication verification and retained its existing verified article snapshots.
- Browser checked the production build on localhost at 390, 640, 768, 1024, 1280 and 1536 px. No horizontal overflow; rendered image widths align with the size hints (small scrollbar differences only). First four catalog images are eager/high, later images lazy. Home hero is eager/high.
- Collection selection navigated to Programming; searching JavaScript within it returned two matching results and retained the collection. The accessibility tree exposes the filter name and the new privacy link text.
- Evidence: `.cache/pagespeed-2026-10-28/catalog-mobile.jpg`, `catalog-desktop.jpg` and `home-sizes.json`.

Self-check: all 11 review-contract code dimensions checked. Fixed before reporting: removed an unused test import. Data/persistence, error handling and infrastructure changes are not applicable. Existing unrelated `.env.example` edits were preserved.

Status: local implementation verified; production deployment pending. New public PageSpeed scores and LCP improvement remain unmeasured until deployment.

## Follow-up: nonempty alt on every image

The owner explicitly requested nonempty alt text on all images. Print cards, home artwork and index thumbnails now use the print title; logos use the configured brand name. Article covers keep their supplied description, falling back to the article title. Internal OG/Pinterest renderer images also carry titles or logo labels. Removed image ancestor `aria-hidden` so the descriptions are exposed; home artwork links are keyboard-accessible. DESIGN.md reflects this policy.

Verification: 64 tests across 12 targeted files, scoped ESLint and production build passed. Browser inspection of seven page types checked 209 images: none had missing/empty alt or an `aria-hidden` ancestor. Evidence: `.cache/pagespeed-2026-10-28/alt-audit.json`. No image files or database records were changed. The implementation remains local and unpublished.
