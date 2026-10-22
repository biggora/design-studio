import { CdnArtwork, Design } from "@/types/design";
import { CDN_MOCKUP_KINDS, type CdnImage, type CdnImageMockup } from "@/lib/listings";

export const designCardWidth = 600;
export const designCardHeight = 400;

export const NO_IMAGE_PLACEHOLDER = "/images/no_image_available.svg";

/** CDN variant widths matching pod-uploader's thumb/card/main files. */
const CDN_VARIANT_WIDTHS = [
  { variant: "thumb", width: 400 },
  { variant: "card", width: 800 },
  { variant: "main", width: 1600 },
] as const;

/**
 * Base of the pod-uploader CDN (`NEXT_PUBLIC_IMAGES_CDN`), trailing slash
 * stripped, or null when unset/empty or not an https URL — the site then
 * behaves as if no design had a CDN image.
 */
export function imagesCdnBase(): string | null {
  const raw = (process.env.NEXT_PUBLIC_IMAGES_CDN ?? "").trim().replace(/\/+$/, "");
  return raw.startsWith("https://") ? raw : null;
}

/**
 * Watermark text stamped over rendered artwork previews (`NEXT_PUBLIC_WATERMARK`,
 * e.g. the domain), trimmed; null when unset/empty — the overlay stays off.
 * Like imagesCdnBase, a NEXT_PUBLIC_* read: inlined at build time, so changing
 * it means set, then redeploy.
 */
export function watermarkText(): string | null {
  const raw = (process.env.NEXT_PUBLIC_WATERMARK ?? "").trim();
  return raw || null;
}

/** Hostname of the CDN base (see imagesCdnBase), for server-side fetch allowlists. */
export function imagesCdnHost(): string | null {
  const base = imagesCdnBase();
  if (!base) return null;
  try {
    return new URL(base).hostname;
  } catch {
    return null;
  }
}

/**
 * The storefront's view of `designs.cdnImage`: the single display image, or null.
 * Row values from both providers arrive as an object/array (Supabase jsonb) or a JSON string (mysql2).
 * The column holds the array of the design's garment mockups (see normalizeCdnImageMockups): the
 * display image is the first vertical (portrait: height > width) mockup in array order (normally
 * `hanger-full`), else the `flat-full` mockup, else the first valid entry. A legacy single
 * `{key, version, width, height}` object is still accepted as-is.
 */
export function normalizeCdnImage(value: unknown): CdnArtwork | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    return pickCdnArtwork(normalizeCdnImageMockups(value) ?? [], "portrait");
  }
  if (!value || typeof value !== "object") return null;
  const { key, version, width, height } = value as Record<string, unknown>;
  if (typeof key !== "string" || !key) return null;
  if (![version, width, height].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 1)) {
    return null;
  }
  return { key, version: version as number, width: width as number, height: height as number };
}

/** The row mappers' view of `designs.cdnImage`: the validated mockup array kept whole, so each
 * surface can pick its own orientation (getDesignImage). A legacy single `{key, version, width,
 * height}` display object (pre-array installs, plain or JSON string) is wrapped as its flat-full
 * entry; null when nothing valid remains. */
export function normalizeCdnArtworkOptions(value: unknown): CdnImage | null {
  return normalizeCdnImageMockups(value) ?? legacyCdnArtworkArray(value);
}

function legacyCdnArtworkArray(value: unknown): CdnImage | null {
  const single = normalizeCdnImage(value);
  return single ? [{ ...single, kind: "flat-full" }] : null;
}

export type DesignImageOrientation = "portrait" | "landscape";

/**
 * One mockup from the stored array, by surface orientation: the first mockup matching it
 * (portrait is normally `hanger-full`, landscape normally `flat-full`), else `flat-full`,
 * else the first entry — so a surface never gets the opposite orientation when the array
 * has a fit, and degrades gracefully when it does not.
 */
function pickCdnArtwork(mockups: CdnImage, orientation: DesignImageOrientation): CdnArtwork | null {
  const oriented = mockups.find(mockup =>
    orientation === "landscape" ? mockup.width > mockup.height : mockup.height > mockup.width);
  const pick = oriented ?? mockups.find(mockup => mockup.kind === "flat-full") ?? mockups[0];
  return pick ? { key: pick.key, version: pick.version, width: pick.width, height: pick.height } : null;
}

/** The ingest API's view of `designs.cdnImage`: the stored mockup array (same provider quirk as
 * normalizeCdnImage). Drops malformed entries; null when none survive or the value is not an array. */
export function normalizeCdnImageMockups(value: unknown): CdnImage | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value)) return null;
  const mockups = value.flatMap((item): CdnImageMockup[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { key, kind, version, width, height } = item as Record<string, unknown>;
    if (typeof key !== "string" || !key) return [];
    if (!(CDN_MOCKUP_KINDS as readonly unknown[]).includes(kind)) return [];
    if (![version, width, height].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 1)) return [];
    return [{ key, kind: kind as CdnImageMockup["kind"], version: version as number, width: width as number, height: height as number }];
  });
  return mockups.length ? mockups : null;
}

function cdnVariantUrl(base: string, cdn: CdnArtwork, variant: string): string {
  return `${base}/${cdn.key}/${variant}-v${cdn.version}.webp`;
}

/** The `share-v<version>.jpg` URL (artwork pre-flattened onto the background color), or null without a CDN image/env. */
export function cdnShareImageUrl(design: Pick<Design, "cdnImage">): string | null {
  const base = imagesCdnBase();
  const cdn = design.cdnImage ? pickCdnArtwork(design.cdnImage, "portrait") : null;
  if (!base || !cdn) return null;
  return `${base}/${cdn.key}/share-v${cdn.version}.jpg`;
}

export type DesignImageSource =
  | {
      kind: "cdn";
      src: string;
      srcSet: string;
      width: number;
      height: number;
      backgroundColor: string;
    }
  | { kind: "remote"; src: string };

/**
 * What the storefront shows for a design: the pod-uploader CDN's garment mockup
 * (transparent WebP variants over the design background) when published, else
 * the existing Redbubble chain via getDesignDisplayImage. The `orientation`
 * picks which stored mockup fits the surface — portrait (the catalog-card pick)
 * by default, landscape for the home hero and about-teaser tiles.
 */
export function getDesignImage(design: Design, orientation: DesignImageOrientation = "portrait"): DesignImageSource {
  const base = imagesCdnBase();
  const cdn = design.cdnImage ? pickCdnArtwork(design.cdnImage, orientation) : null;
  if (base && cdn) {
    return {
      kind: "cdn",
      src: cdnVariantUrl(base, cdn, "card"),
      srcSet: CDN_VARIANT_WIDTHS.map(({ variant, width }) => `${cdnVariantUrl(base, cdn, variant)} ${width}w`).join(", "),
      width: cdn.width,
      height: cdn.height,
      backgroundColor: design.backgroundColor,
    };
  }
  return { kind: "remote", src: getDesignDisplayImage(design).trim() || NO_IMAGE_PLACEHOLDER };
}

/**
 * The image for consumers that may not accept WebP or transparency — OG and
 * Twitter cards, Pinterest pins, JSON-LD `image`, RSS: the CDN's share JPEG
 * when available, else the existing display image. No placeholder fallback —
 * callers keep their own empty-value handling.
 */
export function getShareImageUrl(design: Design): string {
  return cdnShareImageUrl(design) ?? getDesignDisplayImage(design).trim();
}

/** A pin needs a saved composition, a CDN share image or a Classic T-Shirt mockup. */
export function hasPinImage(design: Design): boolean {
  return !!design.pinterestImage || cdnShareImageUrl(design) !== null || getMockupUrl(design) !== null;
}

/**
 * Reads the Classic T-Shirt mockup URL the sync stores in `props.mockup_tshirt`
 * (extracted from the design's marketplace page); null when absent or junk.
 */
export function getMockupUrl(design: Pick<Design, "props">): string | null {
  const raw = (design.props as { mockup_tshirt?: unknown } | undefined)?.mockup_tshirt;
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

export type ProductMockupKey = "mockup_hat" | "mockup_mug" | "mockup_mousepad";

/**
 * Reads a product mockup URL the sync stores in `props` (`mockup_hat`,
 * `mockup_mug`, `mockup_mousepad` — extracted from the design's marketplace
 * page when that product exists); null when absent or junk, so callers show
 * only the products the marketplace actually lists. Same contract as getMockupUrl.
 */
export function getProductMockupUrl(design: Pick<Design, "props">, key: ProductMockupKey): string | null {
  const raw = (design.props as Record<string, unknown> | undefined)?.[key];
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

/**
 * The image the storefront shows for a design: the clean Classic T-Shirt
 * mockup when the sync captured one (the flat artwork URL carries Redbubble's
 * anti-hotlink watermark), otherwise the flat artwork.
 */
export function getDesignDisplayImage(
  design: Pick<Design, "props" | "externalImageUrl">,
): string {
  return getMockupUrl(design) ?? design.externalImageUrl;
}

/**
 * Subtle light shimmer for next/image `placeholder="blur"` on remote
 * artwork, so cards and heroes show a soft block instead of a dark slab
 * while the image loads. Light by design — a sanctioned literal (DESIGN.md,
 * Colors); it reads as "photograph loading", never as a UI surface.
 */
export const imageBlurPlaceholder =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Crect width='8' height='8' fill='%23d3d9d4'/%3E%3C/svg%3E";

export function getImageUrl(imageName: string): string {
  return `/images/${imageName}`;
}

export function getPlaceholderImage(width: number, height: number): string {
  return `https://via.placeholder.com/${width}x${height}`;
}
