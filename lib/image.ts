export const printCardWidth = 600;
export const printCardHeight = 400;

export function getImageUrl(imageName: string): string {
  return `/static/images/${imageName}`;
}

export function getPlaceholderImage(width: number, height: number): string {
  return `https://via.placeholder.com/${width}x${height}`;
}
