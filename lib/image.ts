export const designCardWidth = 600;
export const designCardHeight = 400;

export function getImageUrl(imageName: string): string {
  return `/images/${imageName}`;
}

export function getPlaceholderImage(width: number, height: number): string {
  return `https://via.placeholder.com/${width}x${height}`;
}
