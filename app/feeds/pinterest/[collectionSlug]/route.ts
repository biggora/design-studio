import { NextResponse } from "next/server";
import { fetchCollectionFeedDesigns, fetchFeedCollections, getSiteConfig } from "@/utils/database";
import {
  FEED_MAX_ITEMS,
  assignCollectionSlugs,
  buildCollectionFeedXml,
} from "@/lib/pinterest-feed";

/**
 * GET /feeds/pinterest/[collectionSlug].xml — RSS 2.0 feed for one collection,
 * for Pinterest's "auto-publish Pins from your RSS feed". The slug is the
 * deterministic derivation of the collection title (lib/pinterest-feed.ts);
 * unknown slugs 404. Cached an hour at the CDN — Pinterest polls about once a day.
 *
 * The App Router only treats [param] as dynamic when it spans a whole segment,
 * so this handler sits at /feeds/pinterest/{slug} and the .xml URL is mapped
 * onto it by the rewrite in next.config.mjs.
 */

const FEED_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate";

function notFoundResponse(): NextResponse {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ collectionSlug: string }> },
) {
  const { collectionSlug } = await params;
  const config = await getSiteConfig();
  const collections = await fetchFeedCollections();
  const slugsByTitle = assignCollectionSlugs(collections);
  const collection = collections.find(entry => slugsByTitle.get(entry.title) === collectionSlug);
  if (!collection) {
    return notFoundResponse();
  }

  const { designs, earliestListingAt } = await fetchCollectionFeedDesigns(
    collection.title,
    FEED_MAX_ITEMS,
  );

  const xml = buildCollectionFeedXml({
    siteName: config.name,
    collection,
    domain: config.domain,
    designs,
    earliestListingAt,
  });
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": FEED_CACHE_CONTROL,
    },
  });
}
