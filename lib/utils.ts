export function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    date = new Date(date);
  }

  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function truncateText(text: string, maxLength: number): string {
  if (text?.length <= maxLength) return text;
  return text?.slice(0, maxLength) + "...";
}

export function generateSlug(text: string): string {
  const hasLeadingSpace = /^\s/.test(text);
  const hasTrailingSpace = /\s$/.test(text);

  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]+/g, '')
    .replace(/\s+/g, '-');

  return `${hasLeadingSpace ? '-' : ''}${slug}${hasTrailingSpace ? '-' : ''}`;
}

export function calculateReadingTime(text: string): number {
  const wordsPerMinute = 200;
  const numberOfWords = text.split(/\s/g).length;
  return Math.ceil(numberOfWords / wordsPerMinute);
}

export function getRedBubbleDesignPageLink(designId: number): string {
  return `https://www.redbubble.com/shop/ap/${designId}`;
}
