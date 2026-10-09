import { NextResponse } from "next/server";
import { fetchCollectionFeedDesigns, fetchFeedCollections, getSiteConfig } from "@/utils/database";
import {
  FEED_MAX_ITEMS,
  assignCollectionSlugs,
  buildFeedIndexXml,
} from "@/lib/pinterest-feed";

/**
 * GET /feeds/pinterest.xml — an index of every per-collection Pinterest feed:
 * one entry with the feed URL, the Pinterest board name (the collection title)
 * and the number of items the feed currently carries. The user copies these
 * URLs into Pinterest's auto-publish settings; the live list is at this URL,
 * docs/PINTEREST_RSS.md explains the setup, and `npm run feeds:list` prints
 * the same table from the database.
 */

const FEED_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate";

export async function GET() {
  const config = await getSiteConfig();
  const collections = await fetchFeedCollections();
  const slugsByTitle = assignCollectionSlugs(collections);

  const feeds = await Promise.all(
    collections.map(async collection => {
      const { designs } = await fetchCollectionFeedDesigns(collection.title, FEED_MAX_ITEMS);
      return {
        title: collection.title,
        description: collection.description,
        slug: slugsByTitle.get(collection.title) as string,
        itemCount: designs.length,
      };
    }),
  );

  const xml = buildFeedIndexXml({
    siteName: config.name,
    domain: config.domain,
    feeds: feeds.sort((a, b) => a.title.localeCompare(b.title)),
  });
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": FEED_CACHE_CONTROL,
    },
  });
}
