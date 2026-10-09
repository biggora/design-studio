import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Design } from "@/types/design";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) {
    return 'Date unavailable';
  }

  const d = typeof date === 'string' ? new Date(date) : date;

  if (!(d instanceof Date) || isNaN(d.getTime())) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength)) + '...';
}

/**
 * Caps text at `maxLength` characters (ellipsis included), cutting at the last
 * word boundary so meta text never ends mid-word.
 */
export function truncateAtWord(text: string | null | undefined, maxLength: number): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const room = Math.max(0, maxLength - 1);
  const window = clean.slice(0, room + 1);
  const lastSpace = window.lastIndexOf(' ');
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : clean.slice(0, room);
  return cut.replace(/[\s.,;:!?-]+$/, '') + '…';
}

export function generateSlug(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function calculateReadingTime(text: string): number {
  const wordsPerMinute = 200;
  const numberOfWords = text.split(/\s/g).length;
  return Math.ceil(numberOfWords / wordsPerMinute);
}

/** Parses a page query param into a safe 1-based integer, defaulting to 1 for anything not a plain positive integer string. */
export function parsePageParam(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) return 1;
  const parsed = parseInt(value, 10);
  return parsed >= 1 ? parsed : 1;
}

export function getRedBubbleDesignPageLink(designId: number): string {
  return `https://www.redbubble.com/shop/ap/${designId}`;
}

/** Returns the value if it is a strict 6-digit hex color (e.g. "#101010"), otherwise undefined. */
export function safeHexColor(value?: string | null): string | undefined {
  if (!value) return undefined;
  return /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}

/** Reads the TeePublic design page link from `props.teepublicLink`, returning it only if it's an https:// URL on teepublic.com (or www.teepublic.com); never throws. */
export function getTeepublicLink(design: Pick<Design, "props">): string | null {
  const raw = (design.props as { teepublicLink?: unknown })?.teepublicLink;
  if (typeof raw !== "string") return null;

  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname === "www.teepublic.com" || parsed.hostname === "teepublic.com")
    ) {
      return raw;
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/** True when the design has at least one place to buy it: a Redbubble listing
 * (stored link or legacy external id) or a validated TeePublic link. Used by
 * the /p landing page (404 rule) and the Pinterest feed (item eligibility) so
 * both agree on "has a marketplace link". */
export function hasMarketplaceLink(
  design: Pick<Design, "externalLink" | "externalId" | "props">,
): boolean {
  return (
    design.externalLink.trim() !== "" ||
    design.externalId !== null ||
    getTeepublicLink(design) !== null
  );
}

export function sanitizeUrl(url?: string | null): string {
  if (!url) return "#";
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {
    // Invalid URL
  }
  return "#";
}
