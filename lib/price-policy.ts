/** Keep in sync with design-studio/lib/price-policy.ts; old snapshots retain their 36h limit. */
export const PRICE_VERIFIED_MS = 36 * 60 * 60 * 1000;
export const PRICE_HISTORY_MS = 30 * 24 * 60 * 60 * 1000;
export interface PricePlanFields {
  price: string;
  checkedAt: string;
  expiresAt: string;
  priceValidUntil?: string;
  pricingVersion?: 2;
  regularPrice?: string;
  salePrice?: string;
  saleEndsAt?: string;
  variant?: string;
  priceStatus?: 'verified' | 'last-checked' | 'regular';
}
export const validPrice = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d+(?:\.\d{1,4})?$/.test(value) &&
  Number.isFinite(Number(value)) &&
  Number(value) > 0;
export function resolvePrice<T extends PricePlanFields>(
  offer: T,
  now = Date.now(),
): T | null {
  if (
    typeof offer.checkedAt !== 'string' ||
    typeof offer.expiresAt !== 'string' ||
    (offer.priceValidUntil !== undefined &&
      typeof offer.priceValidUntil !== 'string') ||
    (offer.saleEndsAt !== undefined &&
      (typeof offer.saleEndsAt !== 'string' ||
        !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(offer.saleEndsAt)))
  )
    return null;
  const checked = Date.parse(offer.checkedAt),
    expires = Date.parse(offer.expiresAt);
  const until = offer.priceValidUntil
    ? Date.parse(
        offer.priceValidUntil.length === 10
          ? `${offer.priceValidUntil}T23:59:59Z`
          : offer.priceValidUntil,
      )
    : Infinity;
  if (offer.priceValidUntil && !Number.isFinite(until)) return null;
  if (
    !validPrice(offer.price) ||
    !Number.isFinite(checked) ||
    checked > now ||
    !Number.isFinite(expires) ||
    expires <= now
  )
    return null;
  if (offer.pricingVersion !== 2)
    return now - checked < PRICE_VERIFIED_MS && until > now ? offer : null;
  if (
    now - checked >= PRICE_HISTORY_MS ||
    expires > checked + PRICE_HISTORY_MS ||
    (offer.variant !== undefined &&
      (typeof offer.variant !== 'string' || offer.variant.length > 200))
  )
    return null;
  if (
    (offer.regularPrice !== undefined && !validPrice(offer.regularPrice)) ||
    (offer.salePrice !== undefined &&
      (!validPrice(offer.salePrice) ||
        !offer.regularPrice ||
        Number(offer.salePrice) >= Number(offer.regularPrice) ||
        offer.salePrice !== offer.price))
  )
    return null;
  const end = offer.saleEndsAt ? Date.parse(offer.saleEndsAt) : undefined;
  if (
    end !== undefined &&
    (!Number.isFinite(end) || !offer.salePrice || end <= checked)
  )
    return null;
  const regular =
    !!offer.regularPrice &&
    ((end !== undefined && end <= now) ||
      (offer.salePrice &&
        end === undefined &&
        now - checked >= PRICE_VERIFIED_MS) ||
      until <= now);
  if (regular)
    return {
      ...offer,
      price: offer.regularPrice!,
      priceValidUntil: undefined,
      priceStatus: 'regular',
    };
  if (until <= now) return null;
  return {
    ...offer,
    priceStatus:
      now - checked < PRICE_VERIFIED_MS ? 'verified' : 'last-checked',
  };
}
/** A projected regular price or an old observation must not become a current schema.org Offer. */
export const isVerifiedPrice = (offer: PricePlanFields): boolean =>
  offer.priceStatus === undefined || offer.priceStatus === 'verified';
