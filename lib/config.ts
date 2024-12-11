import { ConfigProp } from "@/types/config";
import { ConfigValue, SiteConfig } from "@/lib/store";
import baseConfig from "@/config/config.json";

export function mapDataToConfig(props: ConfigProp[]): SiteConfig {
  const config: SiteConfig = baseConfig;
  for (const prop of props) {
    if (/\./.test(prop.key)) {
      const keys = prop.key.split(".");
      const lastKey = keys.pop();
      let obj: SiteConfig = config;
      for (const key of keys) {
        obj = obj[key as keyof typeof obj] as unknown as typeof obj;
      }
      if (lastKey) {
        obj[lastKey as keyof typeof obj] = prop.value as ConfigValue;
      }
      continue;
    }
    config[prop.key as keyof SiteConfig] = prop.value as ConfigValue;
  }
  return config;
}
