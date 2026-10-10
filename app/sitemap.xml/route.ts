import { NextResponse } from "next/server";
import { SiteConfig } from "@/lib/store";
import { Design } from "@/types/design";
import { getSiteConfig, fetchDesigns, fetchFeaturedCollections } from "@/utils/database";
import { designPath } from "@/lib/slug";
import { escapeXml } from "@/lib/pinterest-feed";
import {collectionPath} from "@/lib/collections";

/**
 * GET /sitemap.xml — the sitemap protocol document for search engines, with a
 * stylesheet PI so opening it in a browser renders a readable page instead of
 * raw XML (public/sitemap.xsl; crawlers ignore it).
 *
 * Hand-rolled route instead of the app/sitemap.ts metadata route because the
 * latter cannot emit the stylesheet PI. The URL set is identical to what the
 * metadata route produced, plus prepared nonempty collection landing pages.
 */

// Safety-net TTL matching the previous metadata route's revalidate.
export const revalidate = 300;

type SitemapEntry = {
  url: string;
  lastmod?: string;
  priority: number;
  changefreq: "monthly";
};

function entryXml(entry: SitemapEntry): string {
  return [
    "  <url>",
    `    <loc>${escapeXml(entry.url)}</loc>`,
    entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : null,
    `    <changefreq>${entry.changefreq}</changefreq>`,
    `    <priority>${entry.priority}</priority>`,
    "  </url>",
  ]
    .filter(line => line !== null)
    .join("\n");
}

export async function GET(): Promise<NextResponse> {
  const config: SiteConfig = await getSiteConfig();
  const staticRoutes: SitemapEntry[] = [
    { url: `https://${config.domain}/`, priority: 1, changefreq: "monthly" },
    { url: `https://${config.domain}/about`, priority: 0.8, changefreq: "monthly" },
    { url: `https://${config.domain}/designs`, priority: 0.8, changefreq: "monthly" },
    { url: `https://${config.domain}/services`, priority: 0.8, changefreq: "monthly" },
    { url: `https://${config.domain}/contact`, priority: 0.5, changefreq: "monthly" },
    { url: `https://${config.domain}/terms-of-service`, priority: 0.5, changefreq: "monthly" },
    { url: `https://${config.domain}/privacy-policy`, priority: 0.5, changefreq: "monthly" },
    { url: `https://${config.domain}/disclosure`, priority: 0.5, changefreq: "monthly" },
  ];

  // Google's limit is 50,000 URLs per sitemap; fetchDesigns caps itemsPerPage
  // at 100 per call, so paginate until all designs are collected.
  const allDesigns: Design[] = [];
  let page = 1;
  let total = Infinity;
  while (allDesigns.length < total && allDesigns.length < 50000) {
    const { designs: pageDesigns, total: pageTotal } = await fetchDesigns(
      page,
      "",
      "",
      100,
    );
    if (!pageDesigns || pageDesigns.length === 0) break;
    allDesigns.push(...pageDesigns);
    total = pageTotal;
    page += 1;
  }

  const designEntries: SitemapEntry[] = allDesigns.map((design: Design) => {
    const createdAt = design.createdAt ? new Date(design.createdAt) : null;
    const isValidDate = createdAt !== null && !isNaN(createdAt.getTime());
    return {
      url: `https://${config.domain}${designPath(design)}`,
      ...(isValidDate
        ? { lastmod: createdAt.toISOString().split("T")[0] }
        : {}),
      priority: 0.5,
      changefreq: "monthly" as const,
    };
  });

  const collectionEntries: SitemapEntry[] = (await fetchFeaturedCollections(config.collectionPages)).map(collection => ({
    url: `https://${config.domain}${collectionPath(collection.collection)}`,
    priority: 0.8,
    changefreq: "monthly",
  }));

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>`,
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...[...staticRoutes, ...collectionEntries, ...designEntries].map(entryXml),
    "</urlset>",
    "",
  ].join("\n");

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
