import { MetadataRoute } from "next";
import { SiteConfig } from "@/lib/store";
import { Design } from "@/types/design";
import { getSiteConfig, fetchDesigns } from "@/utils/database";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const newConfig: SiteConfig = await getSiteConfig();
  const lastModified: string = new Date().toISOString().split("T")[0];
  const sitemap = [
    {
      url: `https://${newConfig.domain}/`,
      lastModified,
      priority: 1,
      changeFreq: "monthly",
    },
    {
      url: `https://${newConfig.domain}/about`,
      lastModified,
      priority: 0.8,
      changeFreq: "monthly",
    },
    {
      url: `https://${newConfig.domain}/contact`,
      lastModified,
      priority: 0.5,
      changeFreq: "monthly",
    },
    {
      url: `https://${newConfig.domain}/terms-of-service`,
      lastModified,
      priority: 0.5,
      changeFreq: "monthly",
    },
    {
      url: `https://${newConfig.domain}/privacy-policy`,
      lastModified,
      priority: 0.5,
      changeFreq: "monthly",
    },
  ];
  // Google's limit is 50,000 URLs per sitemap
  const { designs } = await fetchDesigns(1, "", "", 1000);

  const designEntries = (designs || []).map((design: Design) => ({
    url: `https://${newConfig.domain}/designs/${design.id}`,
    lastModified: (design.createdAt || "").toString().split("T")[0],
    priority: 0.5,
    changeFreq: "monthly",
  }));
  return [...sitemap, ...designEntries];
}
