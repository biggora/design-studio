import { imagesCdnBase } from "@/lib/image";
import { getRedBubbleDesignPageLink, getTeepublicLink } from "@/lib/utils";
import type { Design } from "@/types/design";
import { resolvePrice, isVerifiedPrice } from "@/lib/price-policy";
export { isVerifiedPrice } from "@/lib/price-policy";

export type PricePlatform = "redbubble" | "teepublic" | "tostadora" | "zazzle";
export type PriceSource = { platform: PricePlatform; url: string; publishedAt?: string };
export type TshirtOffer = PriceSource & {
  name: string;
  seller: string;
  price: string;
  currency: string;
  image?: string;
  availability?: string;
  priceValidUntil?: string;
  checkedAt: string;
  expiresAt: string;
  pricingVersion?: 2;
  regularPrice?: string;
  salePrice?: string;
  saleEndsAt?: string;
  variant?: string;
  priceStatus?: 'verified' | 'last-checked' | 'regular';
};

export const PRICE_STORES: Record<PricePlatform, string> = {
  redbubble: "Redbubble", teepublic: "TeePublic", tostadora: "Tostadora", zazzle: "Zazzle",
};
const HOSTS: Record<PricePlatform, string[]> = {
  redbubble: ["www.redbubble.com", "redbubble.com"],
  teepublic: ["www.teepublic.com", "teepublic.com"],
  tostadora: ["www.tostadora.co.uk", "www.tostadora.com", "www.latostadora.com"],
  zazzle: ["www.zazzle.com"],
};
const MAX_BYTES = 64 * 1024;
const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

/** Restrict both initial destinations and redirects to known marketplace listings. */
export function priceSourceUrl(source: PriceSource): string | null {
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:" || url.port || url.username || url.password || !HOSTS[source.platform].includes(url.hostname)) return null;
    if (!listingId(source.platform, url.pathname)) return null;
    url.hash = "";
    url.search = "";
    return url.href;
  } catch { return null; }
}

function listingId(platform: PricePlatform, pathname: string): string | undefined {
  const pattern = {
    redbubble: /\/(?:shop\/ap\/|i\/t-shirt\/[^/]+\/)(\d+)(?:\/|$)/,
    teepublic: /^\/t-shirt\/(\d+)-/,
    tostadora: /^\/web\/[^/]+\/(\d+)\/?$/,
    zazzle: /_t_shirt-(\d+)$/,
  }[platform];
  return pathname.match(pattern)?.[1];
}

/** Collector and renderer use the same canonical source for each marketplace. */
export function tshirtPriceSources(design: Design, listings: { platform: string; url: string; publishedAt?: string }[]): PriceSource[] {
  const candidates = [
    { platform: "redbubble", url: design.externalLink || (design.externalId !== null ? getRedBubbleDesignPageLink(design.externalId) : "") },
    { platform: "teepublic", url: getTeepublicLink(design) || "" },
    ...listings,
  ];
  const sources: PriceSource[] = [];
  for (const candidate of candidates) {
    if (!Object.hasOwn(PRICE_STORES, candidate.platform)) continue;
    const source = candidate as PriceSource, url = priceSourceUrl(source);
    if (url && !sources.some(saved => saved.platform === source.platform)) {
      const publishedAt = listings.find(listing => listing.platform === source.platform && priceSourceUrl(listing as PriceSource) === url)?.publishedAt;
      sources.push({ ...source, url, ...(publishedAt ? {publishedAt} : {}) });
    }
  }
  return sources;
}

/** The publisher writes public version-1 snapshots; rendering only reads our own CDN. */
export function parsePriceSnapshot(value: unknown, designId: string, sources: PriceSource[], now = Date.now()): TshirtOffer[] {
  if (!value || typeof value !== "object") return [];
  const snapshot = value as { version?: unknown; designId?: unknown; offers?: unknown };
  if ((snapshot.version !== 1 && snapshot.version !== 2) || snapshot.designId !== designId || !Array.isArray(snapshot.offers) || snapshot.offers.length > 4) return [];
  const offers: TshirtOffer[] = [];
  for (const item of snapshot.offers) {
    if (!item || typeof item !== "object") continue;
    const offer = item as TshirtOffer;
    const source = sources.find(source => source.platform === offer.platform);
    const url = source && priceSourceUrl(offer), sourceUrl = source && priceSourceUrl(source);
    if (!url || !sourceUrl || listingId(offer.platform, new URL(url).pathname) !== listingId(offer.platform, new URL(sourceUrl).pathname)) continue;
    if (typeof offer.name !== "string" || !offer.name.trim() || typeof offer.price !== "string" || !/^\d+(?:\.\d{1,4})?$/.test(offer.price) || !Number.isFinite(Number(offer.price)) || Number(offer.price) <= 0 || !CURRENCIES.has(offer.currency)) continue;
    if (offer.pricingVersion !== undefined && offer.pricingVersion !== 2) continue;
    const resolved = resolvePrice(offer, now);
    if (!resolved || offers.some(saved => saved.platform === offer.platform)) continue;
    offers.push({ ...resolved, seller: PRICE_STORES[offer.platform] });
  }
  return offers.sort((a, b) => Number(isVerifiedPrice(b)) - Number(isVerifiedPrice(a)) || Object.keys(PRICE_STORES).indexOf(a.platform) - Object.keys(PRICE_STORES).indexOf(b.platform));
}

export function isFreshTshirtOffer(offer: TshirtOffer, now = Date.now()): boolean {
  const resolved = resolvePrice(offer, now);
  return !!resolved && isVerifiedPrice(resolved);
}

export async function getTshirtOffers(designId: string, sources: PriceSource[]): Promise<TshirtOffer[]> {
  const base = imagesCdnBase();
  if (!base || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(designId)) return [];
  try {
    const response = await fetch(`${base}/prices/${designId}/tshirt-v1.json`, {
      redirect: "error", signal: AbortSignal.timeout(2000), next: { revalidate: 300, tags: ["marketplace-prices"] },
    });
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_BYTES) return [];
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_BYTES) return [];
    return parsePriceSnapshot(JSON.parse(text), designId, sources);
  } catch { return []; }
}

/** Listing pages reuse the same cached snapshots, in parallel and only for visible designs. */
export async function getListingTshirtOffers(designs: Design[]): Promise<Map<string, TshirtOffer>> {
  const entries = await Promise.all(designs.map(async design => [
    design.id, (await getTshirtOffers(design.id, tshirtPriceSources(design, [])))[0],
  ] as const));
  return new Map(entries.filter((entry): entry is readonly [string, TshirtOffer] => !!entry[1]));
}
