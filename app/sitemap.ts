import { supabase } from "@/utils/supabase";
import { PostgrestSingleResponse } from "@supabase/supabase-js";
import { MetadataRoute } from "next";
import { SiteConfig } from "@/lib/store";
import { mapDataToConfig } from "@/lib/config";
import { ConfigProp } from "@/types/config";
import { Design } from "@/types/design";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data: params } = await supabase.from("studio").select("*");
  const newConfig: SiteConfig = mapDataToConfig(params as ConfigProp[]);
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
  const { data }: PostgrestSingleResponse<Design[]> = await supabase
    .from("designs")
    .select("*");

  const designs = (data || []).map((design: Design) => ({
    url: `https://${newConfig.domain}/designs/${design.id}`,
    lastModified: (design.createdAt || "").toString().split("T")[0],
    priority: 0.5,
    changeFreq: "monthly",
  }));
  return [...sitemap, ...designs];
}
