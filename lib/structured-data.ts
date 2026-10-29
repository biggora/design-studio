import type { SiteConfig } from "@/lib/store";
import type { TshirtOffer } from "@/lib/marketplace-prices";

/** One concrete marketplace T-shirt; other stores' currencies are not aggregated. */
export function tshirtProductJsonLd(pageUrl: string, offer: TshirtOffer, description: string, image: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${pageUrl}#tshirt-${offer.platform}`,
    name: offer.name,
    description,
    image: offer.image || image,
    category: "T-Shirt",
    url: pageUrl,
    mainEntityOfPage: { "@id": `${pageUrl}#webpage` },
    offers: {
      "@type": "Offer",
      url: offer.url,
      price: offer.price,
      priceCurrency: offer.currency,
      seller: { "@type": "Organization", name: offer.seller },
      ...(offer.availability ? { availability: offer.availability } : {}),
      ...(offer.priceValidUntil ? { priceValidUntil: offer.priceValidUntil } : {}),
    },
  };
}

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
