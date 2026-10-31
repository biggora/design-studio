import type { SiteConfig } from "@/lib/store";

/**
 * The slice of the site config that client components read through
 * ConfigContext (Header, ContactForm, SocialLinks). The provider's value is
 * serialized into every page's HTML and RSC payload, and each regeneration of
 * a page is billed per 8 KB written to the ISR cache — so the full config
 * (home copy, collection and gift page profiles, …) must not travel with it.
 * Server components keep using `getSiteConfig()`.
 */
export type ClientConfig = Pick<SiteConfig, "name" | "siteLogo" | "email" | "social"> & {
  articles?: { label?: string };
};

export function toClientConfig(config: SiteConfig): ClientConfig {
  return {
    name: config.name,
    siteLogo: config.siteLogo,
    email: config.email,
    social: config.social,
    ...(config.articles?.label ? { articles: { label: config.articles.label } } : {}),
  };
}
