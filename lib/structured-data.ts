import type { SiteConfig } from "@/lib/store";
import type { TshirtOffer } from "@/lib/marketplace-prices";
import { isVerifiedPrice } from "@/lib/price-policy";
import type { Design } from "@/types/design";
import { designPath } from "@/lib/slug";
import { getShareImageUrl } from "@/lib/image";

/** studio.value is text; config.json may provide the same setting as an array. */
export function getAlternateNames(value: unknown, name: string): string[] {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  const names = value.filter((item): item is string => typeof item === "string").map(item => item.trim());
  return [...new Set(names.filter(item => item && item !== name))];
}

/** A carousel needs at least three complete products; otherwise retain a plain link list. */
export function designListElements(designs: Design[], siteUrl: string, offers: Map<string, TshirtOffer>, brandName: string, offset = 0) {
  const products = designs.length >= 3 && designs.every(design => {const offer=offers.get(design.id);return offer && isVerifiedPrice(offer);});
  return designs.map((design, index) => {
    const url = `${siteUrl}${designPath(design)}`;
    const offer = offers.get(design.id);
    return {
      "@type": "ListItem",
      position: offset + index + 1,
      name: design.title,
      url,
      ...(products && offer ? {item: tshirtProductJsonLd(url, offer, design.description,
        new URL(getShareImageUrl(design) || "/images/no_image_available.svg", `${siteUrl}/`).href, brandName)} : {}),
    };
  });
}

/** One concrete marketplace T-shirt; other stores' currencies are not aggregated. */
export function tshirtProductJsonLd(pageUrl: string, offer: TshirtOffer, description: string, image: string, brandName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${pageUrl}#tshirt-${offer.platform}`,
    name: offer.name,
    description,
    image: offer.image || image,
    category: "T-Shirt",
    brand: { "@type": "Brand", name: brandName },
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
  const pageUrl = new URL(path, `${siteUrl}/`);
  const url = pageUrl.href;
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${url}#webpage`,
    url,
    name,
    inLanguage: "en",
    isPartOf: { "@id": `${siteUrl}/#website` },
    publisher: { "@id": `${siteUrl}/#organization` },
    ...(pageUrl.pathname !== "/" ? {
      breadcrumb: {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name, item: url },
        ],
      },
    } : {}),
  };
}
