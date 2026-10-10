# Home catalog discovery

Authorized scope: the next priority in the ThreadQuirk discovery/organic-search plan. Keep the existing visual system, English audience and free infrastructure.

The chosen approach keeps the existing carousel at the top, with a compact discovery section immediately below: configurable heading and copy, a native GET search form, direct links to the five prepared collection pages and the newest five real designs. This gives buyers direct entry into the working search and makes the collection landing pages easier to find.

The owner accepts search below the carousel, in the top menu, or above the slide's Browse designs button. Use the first option: a single stable form outside rotating links needs no added carousel interaction. Account measurement remains the next SEO checkpoint. This step does not claim a traffic increase or a human selection-time measurement.

Use `home.title`, `home.heading` and `home.description` in JSON defaults / studio dot-notation overrides; brand and domain still come from configuration. Metadata describes the print catalog. Keep the homepage self-canonical and collection links canonical. The form uses `/designs?search=...`, whose results remain `noindex`.

On mobile, only the homepage gallery uses two compact cards per row. Artwork stays uncropped; title/image links open the complete detail page. Description, collection row and repeated CTA remain visible from `sm` upward. Catalog and related grids retain their current defaults.

Verification: regressions for carousel → search → themes → prints order and configurable metadata; production build and lint; Chromium at 390×844 and 1440×900; native search both with and without JavaScript; eight known `cat lover gift` designs; collection navigation; no horizontal overflow and 44px search button. Do not add dependencies, DB queries, migrations or account integrations.
