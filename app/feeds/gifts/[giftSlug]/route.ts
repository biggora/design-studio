import { NextResponse } from "next/server";
import { fetchGiftFeedDesigns, getSiteConfig } from "@/utils/database";
import { FEED_MAX_ITEMS, buildCollectionFeedXml } from "@/lib/pinterest-feed";
import { getGiftPages, giftPath } from "@/lib/gifts";

/**
 * GET /feeds/gifts/[giftSlug].xml — RSS 2.0 feed for one gift page, in the same item
 * format as the Pinterest collection feeds. NOT for Pinterest: it deliberately repeats
 * designs that also sit in their collection feeds (no one-feed-per-design rule).
 * The .xml URL is mapped onto this handler by the rewrite in next.config.mjs.
 */

const FEED_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ giftSlug: string }> },
) {
  const { giftSlug } = await params;
  const config = await getSiteConfig();
  const page = getGiftPages(config.giftPages).find(entry => entry.slug === giftSlug);
  if (!page) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const { designs, earliestListingAt } = await fetchGiftFeedDesigns(
    page,
    FEED_MAX_ITEMS,
  );
  const xml = buildCollectionFeedXml({
    siteName: config.name,
    collection: { title: page.heading || page.title, description: page.description },
    domain: config.domain,
    designs,
    earliestListingAt,
    link: `https://${config.domain}${giftPath(page.slug)}`,
  });
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": FEED_CACHE_CONTROL,
    },
  });
}
