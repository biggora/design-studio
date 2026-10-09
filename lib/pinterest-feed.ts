import { createHash } from "crypto";
import { Design } from "@/types/design";
import { generateSlug } from "@/lib/utils";

/**
 * Pinterest RSS feed builders. Pure string/Date logic — no DB, no Next runtime —
 * so the feed routes stay thin and every rule Pinterest enforces on feeds
 * (RSS 2.0, exactly one media:content per item, every URL on the claimed
 * domain) is unit-testable here.
 *
 * Pinterest reads the Pin title from <title>, the description from
 * <description>, and makes one Pin per image found in <enclosure> or
 * <media:content> — hence exactly one <media:content> and no other URL that
 * could be mistaken for an image.
 */

export const PIN_WIDTH = 1000;
export const PIN_HEIGHT = 1500;

/** Pinterest auto-publishes at most 200 pins/day per feed; 100 keeps each feed inside one day's budget. */
export const FEED_MAX_ITEMS = 100;
export const FEED_TITLE_MAX = 100;
export const FEED_DESCRIPTION_MAX = 500;

/** The pin URL carries ?v=<updatedAt hash>; the route itself ignores it. */
export function designVersionHash(design: Pick<Design, "updatedAt" | "createdAt">): string {
  const source = design.updatedAt || design.createdAt || "1";
  return createHash("sha256").update(source).digest("hex").slice(0, 6);
}

/** Landing path for a design under /p — same slug||id fallback rule as designPath. */
export function pinLandingPath(design: Pick<Design, "id" | "slug">): string {
  return `/p/${design.slug || design.id}`;
}

export function pinLandingUrl(domain: string, design: Pick<Design, "id" | "slug">): string {
  return `https://${domain}${pinLandingPath(design)}`;
}

export function pinImageUrl(
  domain: string,
  design: Pick<Design, "id" | "slug" | "updatedAt" | "createdAt">,
): string {
  return `${pinLandingUrl(domain, design)}/pin.jpg?v=${designVersionHash(design)}`;
}

/**
 * Deterministic ASCII slug for a collection title ("Bugs, Tests and
 * Hallucinations" → "bugs-tests-and-hallucinations"). Collections have no slug
 * column, so feeds address them by this derivation: identical titles are
 * disambiguated with -2/-3… suffixes assigned in title order, which keeps the
 * mapping stable as long as the collection set is stable.
 */
export function collectionSlugFor(title: string, taken: ReadonlySet<string>): string {
  const base = generateSlug(title) || "collection";
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Assigns slugs to every collection deterministically (title ASC, then title again). */
export function assignCollectionSlugs(collections: { title: string }[]): Map<string, string> {
  const taken = new Set<string>();
  const bySlug = new Map<string, string>();
  for (const { title } of [...collections].sort((a, b) => a.title.localeCompare(b.title))) {
    const slug = collectionSlugFor(title, taken);
    taken.add(slug);
    bySlug.set(title, slug);
  }
  return bySlug;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822 date (the RSS 2.0 <pubDate> format), e.g. "Wed, 07 Oct 2026 08:10:00 GMT". */
export function toRfc822(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return d.toUTCString();
}

/** Plain text for <description>: no HTML tags, no URLs, collapsed whitespace, ≤ 500 chars. */
export function feedDescription(design: Pick<Design, "description">): string {
  const text = design.description
    .replace(/<[^>]*>/g, " ") // strip any markup
    .replace(/https?:\/\/\S+/g, "") // Pinterest requires feed URLs to stay on the claimed domain
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= FEED_DESCRIPTION_MAX) return text;
  return `${text.slice(0, FEED_DESCRIPTION_MAX - 3).trimEnd()}...`;
}

/** Pin title: the design title, at most 100 characters. */
export function feedTitle(design: Pick<Design, "title">): string {
  if (design.title.length <= FEED_TITLE_MAX) return design.title;
  return `${design.title.slice(0, FEED_TITLE_MAX - 3).trimEnd()}...`;
}

export type FeedItemInput = {
  design: Design;
  /** Earliest design_listings.publishedAt for the design, when one exists. */
  listingPublishedAt?: string;
};

export function buildFeedItem(domain: string, { design, listingPublishedAt }: FeedItemInput): string {
  const landing = pinLandingUrl(domain, design);
  const pubDate = toRfc822(listingPublishedAt || design.createdAt) ?? toRfc822(new Date());
  return [
    "    <item>",
    `      <title>${escapeXml(feedTitle(design))}</title>`,
    `      <link>${escapeXml(landing)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(landing)}</guid>`,
    `      <description>${escapeXml(feedDescription(design))}</description>`,
    `      <pubDate>${escapeXml(pubDate ?? "")}</pubDate>`,
    `      <media:content url="${escapeXml(pinImageUrl(domain, design))}" medium="image" type="image/jpeg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}"/>`,
    "    </item>",
  ].join("\n");
}

export type CollectionFeedInput = {
  siteName: string;
  collection: { title: string; description: string };
  domain: string;
  designs: Design[];
  earliestListingAt: Record<string, string>;
  now?: Date;
};

export function buildCollectionFeedXml({
  siteName,
  collection,
  domain,
  designs,
  earliestListingAt,
  now = new Date(),
}: CollectionFeedInput): string {
  const items = designs
    .slice(0, FEED_MAX_ITEMS)
    .map(design => buildFeedItem(domain, { design, listingPublishedAt: earliestListingAt[design.id] }));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">',
    "  <channel>",
    `    <title>${escapeXml(`${siteName} – ${collection.title}`)}</title>`,
    `    <link>${escapeXml(`https://${domain}/designs?collection=${encodeURIComponent(collection.title)}`)}</link>`,
    `    <description>${escapeXml(collection.description || `Designs from the ${collection.title} collection.`)}</description>`,
    "    <language>en</language>",
    `    <lastBuildDate>${escapeXml(toRfc822(now) ?? "")}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export type FeedIndexEntry = {
  title: string;
  description: string;
  slug: string;
  itemCount: number;
};

/** A simple human/site index of every per-collection feed, for wiring boards in Pinterest. */
export function buildFeedIndexXml({
  siteName,
  domain,
  feeds,
  now = new Date(),
}: {
  siteName: string;
  domain: string;
  feeds: FeedIndexEntry[];
  now?: Date;
}): string {
  const items = feeds.map(feed =>
    [
      "    <item>",
      `      <title>${escapeXml(`${siteName} – ${feed.title}`)}</title>`,
      `      <link>${escapeXml(`https://${domain}/feeds/pinterest/${feed.slug}.xml`)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(`https://${domain}/feeds/pinterest/${feed.slug}.xml`)}</guid>`,
      `      <description>${escapeXml(`${feed.itemCount} designs. Pinterest board: ${feed.title}. Board description: ${feed.description || `Designs from the ${feed.title} collection.`}`)}</description>`,
      `      <pubDate>${escapeXml(toRfc822(now) ?? "")}</pubDate>`,
      "    </item>",
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">',
    "  <channel>",
    `    <title>${escapeXml(`${siteName} – Pinterest feed index`)}</title>`,
    `    <link>${escapeXml(`https://${domain}/`)}</link>`,
    `    <description>${escapeXml(`One RSS feed per collection, for Pinterest auto-publish. Each feed saves to the board named after its collection. Landing pages under /p lead to the marketplaces.`)}</description>`,
    "    <language>en</language>",
    `    <lastBuildDate>${escapeXml(toRfc822(now) ?? "")}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
