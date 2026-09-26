export const designCardWidth = 600;
export const designCardHeight = 400;

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
