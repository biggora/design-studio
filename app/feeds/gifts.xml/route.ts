import { NextResponse } from "next/server";
import { fetchGiftFeedDesigns, getSiteConfig } from "@/utils/database";
import { FEED_MAX_ITEMS, buildFeedIndexXml } from "@/lib/pinterest-feed";
import { getGiftPages } from "@/lib/gifts";

/**
 * GET /feeds/gifts.xml — an index of the gift page feeds (/feeds/gifts/<slug>.xml).
 * Not part of the Pinterest index: these feeds overlap the collection feeds.
 */

const FEED_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate";

export async function GET() {
  const config = await getSiteConfig();
  const feeds = await Promise.all(
    getGiftPages(config.giftPages).map(async page => {
      const { designs } = await fetchGiftFeedDesigns(
        page,
        FEED_MAX_ITEMS,
      );
      return { title: page.heading || page.title, description: page.description, slug: page.slug, itemCount: designs.length };
    }),
  );

  const xml = buildFeedIndexXml({
    siteName: config.name,
    domain: config.domain,
    feeds,
    labels: {
      basePath: "/feeds/gifts/",
      channelTitle: `${config.name} – Gift page feeds`,
      channelDescription: "One RSS feed per gift page. These feeds overlap the collection feeds and are not for Pinterest.",
      itemDescription: feed => `${feed.itemCount} designs. ${feed.description}`,
    },
  });
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": FEED_CACHE_CONTROL,
    },
  });
}
