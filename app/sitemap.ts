import { MetadataRoute } from "next";
import { SiteConfig } from "@/lib/store";
import { Design } from "@/types/design";
import { getSiteConfig, fetchDesigns } from "@/utils/database";

// Safety-net TTL for the studio config cache; edits also trigger
// /api/revalidate/config for near-immediate invalidation.
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const newConfig: SiteConfig = await getSiteConfig();
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `https://${newConfig.domain}/`,
      priority: 1,
      changeFrequency: "monthly",
    },
    {
      url: `https://${newConfig.domain}/about`,
      priority: 0.8,
      changeFrequency: "monthly",
    },
    {
      url: `https://${newConfig.domain}/designs`,
      priority: 0.8,
      changeFrequency: "monthly",
    },
    {
      url: `https://${newConfig.domain}/services`,
      priority: 0.8,
      changeFrequency: "monthly",
    },
    {
      url: `https://${newConfig.domain}/contact`,
      priority: 0.5,
      changeFrequency: "monthly",
    },
    {
      url: `https://${newConfig.domain}/terms-of-service`,
      priority: 0.5,
      changeFrequency: "monthly",
    },
    {
      url: `https://${newConfig.domain}/privacy-policy`,
      priority: 0.5,
      changeFrequency: "monthly",
    },
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

  const designEntries: MetadataRoute.Sitemap = allDesigns.map(
    (design: Design) => {
      const createdAt = design.createdAt ? new Date(design.createdAt) : null;
      const isValidDate = createdAt !== null && !isNaN(createdAt.getTime());
      return {
        url: `https://${newConfig.domain}/designs/${design.id}`,
        ...(isValidDate
          ? { lastModified: createdAt.toISOString().split("T")[0] }
          : {}),
        priority: 0.5,
        changeFrequency: "monthly",
      };
    },
  );
  return [...staticRoutes, ...designEntries];
}
