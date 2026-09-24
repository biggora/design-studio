import { MetadataRoute } from "next";
import { SiteConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/database";

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
