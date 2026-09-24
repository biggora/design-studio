import { MetadataRoute } from "next";
import { SiteConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/database";

// Safety-net TTL for the studio config cache; edits also trigger
// /api/revalidate/config for near-immediate invalidation.
export const revalidate = 300;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const newConfig: SiteConfig = await getSiteConfig();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `https://${newConfig.domain}/sitemap.xml`,
    host: `https://${newConfig.domain}`,
  };
}
