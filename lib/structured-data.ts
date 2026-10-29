import type { SiteConfig } from "@/lib/store";

/** The page and the global website/organization share stable identities. */
export function pageJsonLd(
  config: Pick<SiteConfig, "domain">,
  path: string,
  name: string,
  type: "WebPage" | "CollectionPage" | "AboutPage" | "ContactPage" | "SearchResultsPage" = "WebPage",
) {
  const siteUrl = `https://${config.domain}`;
  const url = new URL(path, `${siteUrl}/`).href;
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${url}#webpage`,
    url,
    name,
    inLanguage: "en",
    isPartOf: { "@id": `${siteUrl}/#website` },
    publisher: { "@id": `${siteUrl}/#organization` },
  };
}
