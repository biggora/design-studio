# Home catalog discovery

Authorized scope: the next priority in the ThreadQuirk discovery/organic-search plan. Keep the existing visual system, English audience and free infrastructure.

The chosen approach is a compact discovery section before the gallery: configurable heading and copy, a native GET search form, direct links to the five prepared collection pages and the newest five real designs. The existing carousel follows the gallery. This gives buyers direct entry into the working search and makes the collection landing pages easier to find.

Alternatives considered: embedding search over the existing carousel keeps a large media block ahead of the prints; an analytics-only step establishes measurement but does not shorten the buyer's path. Account measurement remains the next SEO checkpoint. This step does not claim a traffic increase or a human selection-time measurement.

Use `home.title`, `home.heading` and `home.description` in JSON defaults / studio dot-notation overrides; brand and domain still come from configuration. Metadata describes the print catalog. Keep the homepage self-canonical and collection links canonical. The form uses `/designs?search=...`, whose results remain `noindex`.

On mobile, only the homepage gallery uses two compact cards per row. Artwork stays uncropped; title/image links open the complete detail page. Description, collection row and repeated CTA remain visible from `sm` upward. Catalog and related grids retain their current defaults.

Verification: regressions for search/links/order and configurable metadata; production build and lint; Chromium at 390×844 and 1440×900; native search both with and without JavaScript; eight known `cat lover gift` designs; collection navigation; no horizontal overflow; primary controls above the consent banner and 44px search button. Do not add dependencies, DB queries, migrations or account integrations.
