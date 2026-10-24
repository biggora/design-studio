import { NextResponse } from "next/server";
import { constantTimeCompare } from "@/lib/sync-auth";

/** `listing.extra` keys carrying a Redbubble product mockup, and the `designs.props` key each fills
 * (only while that key is empty). */
export const MOCKUP_EXTRA_PROPS = {
  mockupTshirt: "mockup_tshirt",
  mockupHat: "mockup_hat",
  mockupMug: "mockup_mug",
  mockupMousepad: "mockup_mousepad",
} as const;
const MOCKUP_EXTRA_KEYS = Object.keys(MOCKUP_EXTRA_PROPS) as (keyof typeof MOCKUP_EXTRA_PROPS)[];

export type ListingPlatform = "redbubble" | "teepublic" | "spreadshirt" | "tostadora";
export type ListingInput = {
  platform: ListingPlatform;
  account: string;
  externalId: string;
  url: string;
  title?: string;
  description?: string;
  tags?: string[];
  thumbnailUrl?: string;
  publishedAt?: string;
  extra?: Record<string, unknown>;
};
/** The four pod-studio garment mockup photos published to the pod-uploader CDN (opaque, no alpha). */
export const CDN_MOCKUP_KINDS = ["flat-full", "flat-close", "hanger-full", "hanger-close"] as const;
/** One mockup photo. `key` addresses the immutable variant files (`<CDN>/<key>/<variant>-v<version>.webp`)
 * and ends in the first 16 hex of the mockup PNG's sha256; `width`/`height` are the `main` variant's size. */
export type CdnImageMockup = { key: string; kind: (typeof CDN_MOCKUP_KINDS)[number]; version: number; width: number; height: number };
/** `design.cdnImage`: the design's mockups on the CDN (stored in `designs."cdnImage"` as-is). */
export type CdnImage = CdnImageMockup[];

export type IngestInput = {
  design: {
    sourceImageId: number;
    sha256: string;
    title: string;
    description?: string;
    tags?: string[];
    backgroundColor?: string;
    cdnImage?: CdnImage;
  };
  listing: ListingInput;
};
export type IngestDesign = {
  id: string;
  slug: string | null;
  title: string;
  externalId: number | null;
  sha256: string | null;
  sourceImageId: number | null;
  cdnImage: CdnImage | null;
};
export type DesignListing = {
  id: string;
  platform: ListingPlatform;
  account: string;
  externalId: string;
  url: string;
  title: string | null;
  tags: string[] | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  extra: Record<string, unknown> | null;
};
export type IngestResult = {
  design: IngestDesign;
  listing: DesignListing;
  created: { design: boolean; listing: boolean };
};
export type ListingLookup = { sha256: string } | { sourceImageId: number };

/** One entry of PUT /api/v1/designs/cdn-image: identifiers (at least one) plus the mockup array. */
export type CdnImageItem = { sha256?: string; sourceImageId?: number; redbubbleId?: string; cdnImage: CdnImage };
export type CdnImageResult = {
  index: number;
  status: "updated" | "not_found" | "conflict";
  designId?: string;
  cdnImage?: CdnImage;
  message?: string;
};
export type CdnImageLookup = { sha256: string } | { sourceImageId: number } | { redbubbleId: string };

export class ListingsError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
    public details?: unknown,
  ) { super(message); }
}

// Keep the existing APIs' string-valued `error`; machine-readable fields are additive.
export function listingsErrorResponse(error: ListingsError): NextResponse {
  return NextResponse.json({
    error: error.message, code: error.code, field: error.field, details: error.details,
  }, { status: error.status, headers: { "Cache-Control": "no-store" } });
}

export function authorizeListingsRequest(request: Request): NextResponse | null {
  const expected = process.env.LISTINGS_API_TOKEN;
  if (!expected?.trim()) {
    return listingsErrorResponse(new ListingsError(503, "NOT_CONFIGURED", "LISTINGS_API_TOKEN is not configured"));
  }
  const provided = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!provided || !constantTimeCompare(provided, expected)) {
    return listingsErrorResponse(new ListingsError(401, "UNAUTHORIZED", "Unauthorized"));
  }
  return null;
}

export function invalid(field: string, message: string): never {
  throw new ListingsError(400, "VALIDATION", message, field);
}

export function strictObject(value: unknown, field: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field, "Expected an object");
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) invalid(field ? `${field}.${key}` : key, "Unknown field");
  }
  return object;
}

export function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    invalid(field, `Expected a non-empty string of at most ${max} characters`);
  }
  return value;
}

function tags(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 100) invalid(field, "Expected at most 100 tags");
  return value.map((tag, index) => text(tag, `${field}.${index}`, 100));
}

export function httpUrl(value: unknown, field: string): string {
  const raw = text(value, field, 2000);
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      invalid(field, "Expected an http(s) URL without credentials");
    }
  } catch { invalid(field, "Expected an http(s) URL"); }
  return raw;
}

export function isoTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) invalid(field, "Expected an ISO-8601 timestamp with timezone");
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) invalid(field, "Invalid calendar date");
  return new Date(value).toISOString();
}

function hash(value: unknown, field = "design.sha256"): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) invalid(field, "Expected a 64-character hexadecimal SHA-256");
  return value.toLowerCase();
}

function sourceId(value: unknown, field = "design.sourceImageId"): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    invalid(field, "Expected a positive safe integer");
  }
  return value;
}

function positiveInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    invalid(field, "Expected an integer of at least 1");
  }
  return value;
}

// Keys are derived, never trusted: a design's CDN files live under designs/<first 16 hex chars of
// its sha256>, and each mockup under <that>/mockups/<16 hex of the mockup PNG's sha256>, so a
// mismatched key could never point at another design's files.
// With `sha16` null (the design is only known by another identifier) the prefix is not fixed
// up front: every key must still share one prefix, which the caller checks against the design.
function cdnImage(value: unknown, field: string, sha16: string | null): CdnImage {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) invalid(field, "Expected an array of 1 to 8 mockups");
  let designKey = `designs/${sha16 ?? "[0-9a-f]{16}"}`;
  const seen = new Set<string>();
  return value.map((item, index) => {
    const at = `${field}[${index}]`;
    const mockup = strictObject(item, at, ["key", "kind", "version", "width", "height"]);
    if (typeof mockup.key !== "string" || !new RegExp(`^${designKey}/mockups/[0-9a-f]{16}$`).test(mockup.key)) {
      invalid(`${at}.key`, sha16 === null && index > 0
        ? `Expected the same designs/<16 hex> prefix as the first key ("${designKey}")`
        : `Expected "${designKey.replace("[0-9a-f]{16}", "<16 hex>")}/mockups/" followed by 16 lowercase hex characters`);
    }
    // Without a known sha16 the first key fixes the prefix the others must share.
    if (sha16 === null && index === 0) designKey = mockup.key.slice(0, "designs/".length + 16);
    if (seen.has(mockup.key)) invalid(`${at}.key`, "Duplicate mockup key");
    seen.add(mockup.key);
    if (!(CDN_MOCKUP_KINDS as readonly unknown[]).includes(mockup.kind)) {
      invalid(`${at}.kind`, `Expected one of ${CDN_MOCKUP_KINDS.join(", ")}`);
    }
    return {
      key: mockup.key,
      kind: mockup.kind as CdnImageMockup["kind"],
      version: positiveInt(mockup.version, `${at}.version`),
      width: positiveInt(mockup.width, `${at}.width`),
      height: positiveInt(mockup.height, `${at}.height`),
    };
  });
}

// Tostadora runs one storefront per country domain (the Mexican shop on latostadora.com),
// so a listing URL is accepted on any of those hosts; every other platform runs on
// <platform>.com plus its subdomains.
const TOSTADORA_DOMAINS = ["tostadora.com", "tostadora.co.uk", "tostadora.fr", "tostadora.de", "tostadora.it", "latostadora.com"];

function listingUrlOnPlatformHost(platform: ListingPlatform, hostname: string): boolean {
  if (platform === "tostadora") {
    return TOSTADORA_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  }
  const domain = `${platform}.com`;
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function listingUrlHostError(platform: ListingPlatform): never {
  invalid("listing.url", platform === "tostadora"
    ? `Expected a URL on one of ${TOSTADORA_DOMAINS.join(", ")}`
    : `Expected a URL on ${platform}.com`);
}

export function parseIngestInput(value: unknown): IngestInput {
  const body = strictObject(value, "", ["design", "listing"]);
  const d = strictObject(body.design, "design", ["sourceImageId", "sha256", "title", "description", "tags", "backgroundColor", "cdnImage"]);
  const l = strictObject(body.listing, "listing", ["platform", "account", "externalId", "url", "title", "description", "tags", "thumbnailUrl", "publishedAt", "extra"]);
  const design: IngestInput["design"] = {
    sourceImageId: sourceId(d.sourceImageId), sha256: hash(d.sha256), title: text(d.title, "design.title", 500),
  };
  if (d.description !== undefined) {
    if (typeof d.description !== "string" || d.description.length > 5000) invalid("design.description", "Expected at most 5000 characters");
    design.description = d.description;
  }
  if (d.tags !== undefined) design.tags = tags(d.tags, "design.tags");
  if (d.backgroundColor !== undefined) {
    if (typeof d.backgroundColor !== "string" || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(d.backgroundColor)) invalid("design.backgroundColor", "Expected #rgb or #rrggbb");
    design.backgroundColor = d.backgroundColor;
  }
  if (d.cdnImage !== undefined) design.cdnImage = cdnImage(d.cdnImage, "design.cdnImage", design.sha256.slice(0, 16));
  if (l.platform !== "redbubble" && l.platform !== "teepublic" && l.platform !== "spreadshirt" && l.platform !== "tostadora") invalid("listing.platform", "Unsupported platform");
  const listing: ListingInput = {
    platform: l.platform, account: text(l.account, "listing.account", 100),
    externalId: text(l.externalId, "listing.externalId", 200), url: httpUrl(l.url, "listing.url"),
  };
  if (listing.platform !== "spreadshirt" && !/^\d+$/.test(listing.externalId)) invalid("listing.externalId", "Expected digits");
  // The legacy Redbubble field and existing readers use a JavaScript number.
  if (listing.platform === "redbubble") {
    if (!Number.isSafeInteger(Number(listing.externalId))) invalid("listing.externalId", "Redbubble ID exceeds the safe integer range");
    listing.externalId = String(Number(listing.externalId));
  }
  const hostname = new URL(listing.url).hostname.toLowerCase();
  if (!listingUrlOnPlatformHost(listing.platform, hostname)) listingUrlHostError(listing.platform);
  if (l.title !== undefined) listing.title = text(l.title, "listing.title", 500);
  if (l.description !== undefined) {
    if (typeof l.description !== "string" || l.description.length > 5000) invalid("listing.description", "Expected at most 5000 characters");
    listing.description = l.description;
  }
  if (l.tags !== undefined) listing.tags = tags(l.tags, "listing.tags");
  if (l.thumbnailUrl !== undefined) listing.thumbnailUrl = httpUrl(l.thumbnailUrl, "listing.thumbnailUrl");
  if (l.publishedAt !== undefined) listing.publishedAt = isoTimestamp(l.publishedAt, "listing.publishedAt");
  if (l.extra !== undefined) {
    if (!l.extra || typeof l.extra !== "object" || Array.isArray(l.extra)) invalid("listing.extra", "Expected an object");
    if (Buffer.byteLength(JSON.stringify(l.extra), "utf8") > 16 * 1024) invalid("listing.extra", "extra exceeds 16 KiB");
    listing.extra = l.extra as Record<string, unknown>;
    for (const key of MOCKUP_EXTRA_KEYS) {
      if (listing.extra[key] === undefined) continue;
      const mockup = new URL(httpUrl(listing.extra[key], `listing.extra.${key}`));
      if (mockup.protocol !== "https:" || !(mockup.hostname.endsWith(".redbubble.net") || mockup.hostname.endsWith(".redbubble.com"))) {
        invalid(`listing.extra.${key}`, "Expected an HTTPS image on a Redbubble image host");
      }
    }
  }
  return { design, listing };
}

export function parseListingLookup(params: URLSearchParams): ListingLookup {
  const keys = [...params.keys()];
  if (keys.length !== 1 || (keys[0] !== "sha256" && keys[0] !== "sourceImageId")) invalid("query", "Provide exactly one of sha256 or sourceImageId");
  if (keys[0] === "sha256") return { sha256: hash(params.get("sha256")) };
  const raw = params.get("sourceImageId")!;
  if (!/^[1-9]\d*$/.test(raw)) invalid("sourceImageId", "Expected a positive integer");
  return { sourceImageId: sourceId(Number(raw)) };
}

// `designs."externalId"` is a JavaScript-safe BIGINT, like the Redbubble listing ID.
function redbubbleId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value) || !Number.isSafeInteger(Number(value))) {
    invalid(field, "Expected a Redbubble work ID: digits that fit a JavaScript safe integer");
  }
  return value;
}

export function parseCdnImageBatch(value: unknown): CdnImageItem[] {
  const body = strictObject(value, "", ["items"]);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) invalid("items", "Expected an array of 1 to 100 items");
  return body.items.map((raw, index) => {
    const at = `items[${index}]`;
    const entry = strictObject(raw, at, ["sha256", "sourceImageId", "redbubbleId", "cdnImage"]);
    const item: Partial<CdnImageItem> = {};
    if (entry.sha256 !== undefined) item.sha256 = hash(entry.sha256, `${at}.sha256`);
    if (entry.sourceImageId !== undefined) item.sourceImageId = sourceId(entry.sourceImageId, `${at}.sourceImageId`);
    if (entry.redbubbleId !== undefined) item.redbubbleId = redbubbleId(entry.redbubbleId, `${at}.redbubbleId`);
    if (item.sha256 === undefined && item.sourceImageId === undefined && item.redbubbleId === undefined) {
      invalid(at, "Expected at least one of sha256, sourceImageId, redbubbleId");
    }
    // A given sha256 fixes the key prefix; otherwise the keys must agree among themselves and the
    // data layer checks them against the resolved design's stored sha256.
    item.cdnImage = cdnImage(entry.cdnImage, `${at}.cdnImage`, item.sha256?.slice(0, 16) ?? null);
    return item as CdnImageItem;
  });
}

export function parseCdnImageLookup(params: URLSearchParams): CdnImageLookup {
  const keys = [...params.keys()];
  const name = keys[0];
  if (keys.length !== 1 || (name !== "sha256" && name !== "sourceImageId" && name !== "redbubbleId")) {
    invalid("query", "Provide exactly one of sha256, sourceImageId or redbubbleId");
  }
  const raw = params.get(name)!;
  if (name === "sha256") return { sha256: hash(raw, "sha256") };
  if (name === "redbubbleId") return { redbubbleId: redbubbleId(raw, "redbubbleId") };
  if (!/^[1-9]\d*$/.test(raw)) invalid("sourceImageId", "Expected a positive integer");
  return { sourceImageId: sourceId(Number(raw), "sourceImageId") };
}
