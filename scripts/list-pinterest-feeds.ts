import "dotenv/config";
import { closeDatabaseConnections, fetchCollectionFeedDesigns, fetchFeedCollections, loadSiteConfig } from "../utils/database";
import { FEED_MAX_ITEMS, assignCollectionSlugs } from "../lib/pinterest-feed";

/**
 * Prints the Pinterest auto-publish setup table for every collection: the RSS
 * feed URL, the Pinterest board to create (the collection title) and the board
 * description to paste. Read-only — same queries the /feeds/pinterest.xml
 * index serves, straight from the database configured in .env.
 */

async function run(): Promise<void> {
  const config = await loadSiteConfig();
  const domain = `https://${config.domain}`;
  const collections = await fetchFeedCollections();
  const slugsByTitle = assignCollectionSlugs(collections);

  const rows = await Promise.all(
    collections.map(async collection => {
      const { designs } = await fetchCollectionFeedDesigns(collection.title, FEED_MAX_ITEMS);
      return {
        feed: `${domain}/feeds/pinterest/${slugsByTitle.get(collection.title)}.xml`,
        board: collection.title,
        description: collection.description || `Designs from the ${collection.title} collection.`,
        items: designs.length,
      };
    }),
  );
  rows.sort((a, b) => a.board.localeCompare(b.board));

  const pipe = (value: string) => value.replace(/\|/g, "\\|");
  console.log(`Pinterest auto-publish setup — ${rows.length} feeds (domain: ${domain})\n`);
  console.log("| Feed URL (paste into Pinterest) | Board name | Board description | Items |");
  console.log("|---|---|---|---|");
  for (const row of rows) {
    console.log(`| ${pipe(row.feed)} | ${pipe(row.board)} | ${pipe(row.description)} | ${row.items} |`);
  }
  console.log(
    `\nIndex of all feeds: ${domain}/feeds/pinterest.xml\n` +
      "Pinterest setup: Settings → Create Pins in bulk → Auto-publish → Connect RSS feed, one board per feed (desktop only).",
  );
}

async function main() {
  try {
    await run();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnections();
  }
}

main();
