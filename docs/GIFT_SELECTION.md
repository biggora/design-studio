# Gift selection

Gift pages select designs by their **occasion or recipient**, not by the latest entries in a broad collection. The same rules drive detail pages, index thumbnails, home/sitemap eligibility and `/feeds/gifts/*.xml`. Ordinary collection/Pinterest feeds are unchanged.

## Automatic selection

`lib/gift-selection.ts` defines 16 subjects: Halloween, Black Friday, Thanksgiving/Friendsgiving, Christmas, Valentine's Day, Mother's Day, Father's Day, back to school, developers, coworkers, pet lovers, gamers/geeks, food lovers, family/friends, hobbyists and self-care/wellness.

Selection uses whole-word phrases in the **title and individual tags**. It ignores descriptions, broad collection labels, generic `gift`/`holiday` tags and cross-selling tags containing `gift`. An explicit other occasion in a title blocks accidental admission through tags. For example, a Christmas design with a Halloween marketing tag does not qualify for Halloween. Generic pumpkin, monster, heart or turkey imagery alone is not sufficient evidence of a specific holiday.

Parent roles must be in the title or an explicit Mother's/Father's Day tag: `programmer dad` and `cat mom` audience tags alone are insufficient. School topics require school context; a filmmaker's `film school` tag does not automatically make a back-to-school design. Ambiguous subjects stay out until their metadata or reviewed markers establish relevance. This is deterministic metadata classification, not visual/AI assessment, and cannot compensate for inaccurate source metadata.

All existing gift slugs have default topics. A custom slug must set `topic` in its `studio.giftPages` entry, for example `"topic": "halloween"`. Unsupported/missing topics have no results; there is no fallback to unfiltered collections. Seasonal windows affect promotion order, not subject selection or URL availability.

Only active designs qualify. Selection scans paginated lightweight metadata for the entire active catalogue before applying display limits. It does not stop at the latest eight or 300 items. Complete image/spec rows are loaded only for selected cards. Collection memberships arrange eligible prints into their first matching section; matching designs in other collections appear under “More matching designs”. A print appears once per gift page. Empty sections disappear. Detail pages retain eight cards per section; RSS retains its 100-item limit, marketplace/image requirements, stable links and GUIDs.

New uploads and subsequent metadata updates are considered on the next request after the existing page/feed caches refresh. No uploader command, backfill job, AI service or cron is required. The classification is not frozen at upload time.

## Reviewed markers

Migration **016**, PostgreSQL and MySQL, adds nullable `designs.giftTopics`:

- `NULL`: automatic classification (the default for existing and new designs).
- `[]`: exclude from every gift page.
- `["halloween", "pet-lovers"]`: authoritative reviewed subjects; replaces inference.

Markers live outside marketplace tags/props and frozen image assignments. Existing scraper and listing-ingest writes omit this column, preserving manual decisions. Unknown/corrupt stored markers fail closed. Only an authenticated operator with existing database write access can set them; there is no public mutation endpoint.

CLI examples (dry-run is the default):

```powershell
npx tsx scripts/gift-selection.ts --report
npx tsx scripts/gift-selection.ts --id=<uuid> --topics=halloween,pet-lovers
npx tsx scripts/gift-selection.ts --id=<uuid> --topics=halloween,pet-lovers --apply
npx tsx scripts/gift-selection.ts --id=<uuid> --topics= --apply
npx tsx scripts/gift-selection.ts --id=<uuid> --auto --apply
```

Writes back up the previous marker in `.cache/`, update only `giftTopics`, and verify readback. They do not alter images, title, collection, `createdAt` or `updatedAt`. Run the report to inspect automatic results before making an exception. A report includes up to 100 prints per section.

## Rollout and verification

Deployment through a normal Git push works before migration 016: if the database reports that only `giftTopics` is missing, selection retries with title/tags and keeps every occasion/recipient filter. This fallback lasts for that request only; a later request reads reviewed markers once the column exists. Other missing columns, permissions, schema-cache and network errors remain visible. No migration or database write runs during a build.

Apply migration 016 through the existing `npm run db:migrate` runner before **writing reviewed markers**. Existing rows remain automatic; no content backfill is needed. Existing `giftPages` entries remain compatible; their slugs resolve to built-in topics without rewriting production configuration. Review any overly specific section headings/blurbs when editing gift copy: those texts never act as filters. “Browse the … collection” intentionally opens the broader catalogue collection.

The reviewed copy plan `docs/plans/2026-10-28-gift-selection-copy.json` preserves the current 16 pages, URLs, seasonal windows and FAQ, assigns explicit topics, uses collection headings rather than promises about particular motifs, and corrects the affected occasion copy. Apply with the existing `scripts/apply-seo-copy.ts --plan=docs/plans/2026-10-28-gift-selection-copy.json --dry-run` / `--apply`, then invalidate config through `POST /api/revalidate/config`. It changes only `studio.giftPages`. Recheck the plan against current configuration if applying after further page edits.

Rollback code without dropping the column: old code ignores it and reviewed decisions are retained. No paid dependencies or schedules are added. Local integration verification is documented in `tests/gifts/README.md`.
