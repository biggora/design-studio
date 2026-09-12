import { ConfigProp } from "@/types/config";
import { ConfigValue, SiteConfig } from "@/lib/store";
import baseConfig from "@/config/config.json";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function mapDataToConfig(props: ConfigProp[]): SiteConfig {
  const config: SiteConfig = structuredClone(baseConfig) as SiteConfig;

  for (const prop of props) {
    if (!prop.key || typeof prop.key !== "string") continue;

    if (/\./.test(prop.key)) {
      const keys = prop.key.split(".");
      if (keys.some((k) => DANGEROUS_KEYS.has(k))) {
        continue;
      }

      const lastKey = keys.pop()!;
      let obj: Record<string, unknown> = config as unknown as Record<string, unknown>;

      for (const key of keys) {
        if (typeof obj[key] !== "object" || obj[key] === null) {
          obj[key] = {};
        }
        obj = obj[key] as Record<string, unknown>;
      }

      if (lastKey && !DANGEROUS_KEYS.has(lastKey)) {
        obj[lastKey] = prop.value as ConfigValue;
      }
      continue;
    }

    if (!DANGEROUS_KEYS.has(prop.key)) {
      (config as unknown as Record<string, unknown>)[prop.key] = prop.value as ConfigValue;
    }
  }

  return config;
}
