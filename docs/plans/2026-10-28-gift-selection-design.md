# Gift selection by occasion and recipient

The collection-only query lets unrelated new prints replace relevant gifts. Fix all 16 configured pages, their index thumbnails, discovery links, sitemap eligibility and gift RSS with one selection rule. This serves relevant discovery and useful search landing pages.

Use conservative, version-controlled subject rules over titles and individual tags. Descriptions are marketing copy and are not evidence. Explicit other holidays in a title prevent a generic tag from admitting a print to a different holiday. Collection membership only arranges already eligible designs into sections; matching designs outside those collections get a final section. Filter before applying section/feed limits, and deduplicate.

Alternatives: manual lists would not admit new prints automatically; a paid/AI classifier introduces cost, nondeterminism and another service. Existing metadata plus optional manual markers is sufficient and explainable. An unrecognised page must configure a supported `topic`; it must never silently show entire collections.

Add nullable `designs.giftTopics` (JSONB/JSON): null/missing means automatic classification; an array is an authoritative reviewed list of topics, including an empty array to exclude all gifts. Keep it separate from marketplace tags and props so imports cannot overwrite it. Provide a dry-run-first CLI for reviewing selection and setting/resetting a single print. Normal uploads need no extra command, uploader change, scheduler or backfill: reads classify their existing title/tags. Read and write through the dual-provider database facade only.

Verification:

1. Reproduce wrong-holiday and wrong-recipient admission; test phrase boundaries, generic descriptions, explicit markers and fresh eligible prints.
2. Verify shared page, thumbnail, feed and live-page selection; test matches beyond the first query batch, inactive exclusion and section deduplication.
3. Test both SQL providers and rerunnable migrations against local PostgreSQL/PostgREST and MySQL, keeping production data unchanged.
4. Generate a read-only report for the full real active catalogue and all configured pages; inspect holiday and recipient examples, then run the regression suite, lint and production build.

Copy verification also covers the current section headings and intros. A reviewed `2026-10-28-gift-selection-copy.json` plan removes obsolete broad-selection promises; apply through the existing copy tool as part of rollout, not through a new content-writing API.

No production data writes, push or deployment are part of this implementation. Existing unrelated changes must be preserved.
