import { Design } from "@/types/design";

export const designCardWidth = 600;
export const designCardHeight = 400;

/**
 * Reads the Classic T-Shirt mockup URL the sync stores in `props.mockup_tshirt`
 * (extracted from the design's marketplace page); null when absent or junk.
 */
export function getMockupUrl(design: Pick<Design, "props">): string | null {
  const raw = (design.props as { mockup_tshirt?: unknown } | undefined)?.mockup_tshirt;
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
 * Subtle Linen-Mist shimmer for next/image `placeholder="blur"` on remote
 * artwork, so cards and heroes show a soft block instead of a dark slab
 * while the image loads.
 */
export const imageBlurPlaceholder =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Crect width='8' height='8' fill='%23d3d9d4'/%3E%3C/svg%3E";

export function getImageUrl(imageName: string): string {
  return `/images/${imageName}`;
}

export function getPlaceholderImage(width: number, height: number): string {
  return `https://via.placeholder.com/${width}x${height}`;
}
