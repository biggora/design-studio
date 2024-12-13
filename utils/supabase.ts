import { createClient } from "@supabase/supabase-js";
import { SiteConfig } from "@/lib/store";
import { mapDataToConfig } from "@/lib/config";
import { ConfigProp } from "@/types/config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const getSiteConfig = async (): Promise<SiteConfig> => {
  const { data } = await supabase.from("studio").select("*");
  return mapDataToConfig(data as ConfigProp[]);
};
