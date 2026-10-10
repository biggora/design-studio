# Collection discovery and search landing pages

Scope: audit current collection coverage, add reviewed memberships where an existing theme fits, fix related designs to use all memberships, and improve five existing collection pages with helpful English copy, crawlable links and sitemap entries. Serve fast print discovery and organic visibility using the existing database; no paid services, schema changes, new routes or full redesign.

Keep `/designs?collection=...` and its pagination canonicals. Store deployment-specific collection page titles, descriptions and introductions in the existing `studio` configuration, rather than hardcoding ThreadQuirk into components. Allow a short visible heading alongside the full metadata title. Only configured, existing, nonempty collections get promoted links and sitemap entries; arbitrary searches stay noindex. Place neighboring theme links after the selected collection's results to preserve mobile print visibility.

Review titles, descriptions and tags before assigning existing themes. Save reviewed additions in `props.curatedCollections` and `design_collections`; Redbubble sync unions these with marketplace memberships, preserving marketplace facts and manual choices. Update the primary label only for currently uncollected designs. Retain a read-only backup and an explicit list of deferred designs whose topics do not fit existing collections. Do not invent categories to hide missing coverage.

Related designs query shared many-to-many memberships, exclude the current design and preserve the existing five-item limit. Legacy installs retain their single-collection fallback. Implement read/write behavior for Supabase and MySQL in the database facade.

Alternatives: editing only Redbubble would require marketplace account access; changing only join rows would lose curation on sync. New collection routes or a separate content/search service add unnecessary migration and upkeep.

Verification: reproduce generic collection metadata and missing secondary-membership recommendations in tests; verify curated memberships survive sync, both providers, pagination and escaping. Query the configured DB read-only before/after a reviewed, additive data update, check known cat prints in Pet lovers and retain search acceptance. Run relevant tests, full suite, lint and production build; inspect the rendered catalog, home links and sitemap on desktop/mobile. Record live publication separately from local verification.

Result: [implementation and verification report](../THREADQUIRK_COLLECTIONS_2026-10-10.md). The reviewed curation data and page copy are in [the deployment plan](2026-10-10-threadquirk-collection-curation.json); apply other deployments' own reviewed plans with the same CLI.
