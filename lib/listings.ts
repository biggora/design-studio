import { NextResponse } from "next/server";
import { constantTimeCompare } from "@/lib/sync-auth";

export type ListingPlatform = "redbubble" | "teepublic" | "spreadshirt";
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
export type IngestInput = {
  design: {
    sourceImageId: number;
    sha256: string;
    title: string;
    description?: string;
    tags?: string[];
    backgroundColor?: string;
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

function invalid(field: string, message: string): never {
  throw new ListingsError(400, "VALIDATION", message, field);
}

function strictObject(value: unknown, field: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field, "Expected an object");
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) invalid(field ? `${field}.${key}` : key, "Unknown field");
  }
  return object;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    invalid(field, `Expected a non-empty string of at most ${max} characters`);
  }
  return value;
}

function tags(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 100) invalid(field, "Expected at most 100 tags");
  return value.map((tag, index) => text(tag, `${field}.${index}`, 100));
}

function httpUrl(value: unknown, field: string): string {
  const raw = text(value, field, 2000);
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      invalid(field, "Expected an http(s) URL without credentials");
    }
  } catch { invalid(field, "Expected an http(s) URL"); }
  return raw;
}

function hash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) invalid("design.sha256", "Expected a 64-character hexadecimal SHA-256");
  return value.toLowerCase();
}

function sourceId(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    invalid("design.sourceImageId", "Expected a positive safe integer");
  }
  return value;
}

export function parseIngestInput(value: unknown): IngestInput {
  const body = strictObject(value, "", ["design", "listing"]);
  const d = strictObject(body.design, "design", ["sourceImageId", "sha256", "title", "description", "tags", "backgroundColor"]);
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
  if (l.platform !== "redbubble" && l.platform !== "teepublic" && l.platform !== "spreadshirt") invalid("listing.platform", "Unsupported platform");
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
  const domain = `${listing.platform}.com`;
  const hostname = new URL(listing.url).hostname.toLowerCase();
  if (hostname !== domain && !hostname.endsWith(`.${domain}`)) invalid("listing.url", `Expected a URL on ${domain}`);
  if (l.title !== undefined) listing.title = text(l.title, "listing.title", 500);
  if (l.description !== undefined) {
    if (typeof l.description !== "string" || l.description.length > 5000) invalid("listing.description", "Expected at most 5000 characters");
    listing.description = l.description;
  }
  if (l.tags !== undefined) listing.tags = tags(l.tags, "listing.tags");
  if (l.thumbnailUrl !== undefined) listing.thumbnailUrl = httpUrl(l.thumbnailUrl, "listing.thumbnailUrl");
  if (l.publishedAt !== undefined) {
    if (typeof l.publishedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(l.publishedAt) || !Number.isFinite(Date.parse(l.publishedAt))) invalid("listing.publishedAt", "Expected an ISO-8601 timestamp with timezone");
    const [year, month, day] = l.publishedAt.slice(0, 10).split("-").map(Number);
    if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) invalid("listing.publishedAt", "Invalid calendar date");
    listing.publishedAt = new Date(l.publishedAt).toISOString();
  }
  if (l.extra !== undefined) {
    if (!l.extra || typeof l.extra !== "object" || Array.isArray(l.extra)) invalid("listing.extra", "Expected an object");
    if (Buffer.byteLength(JSON.stringify(l.extra), "utf8") > 16 * 1024) invalid("listing.extra", "extra exceeds 16 KiB");
    listing.extra = l.extra as Record<string, unknown>;
    if (listing.extra.mockupTshirt !== undefined) {
      const mockup = new URL(httpUrl(listing.extra.mockupTshirt, "listing.extra.mockupTshirt"));
      if (mockup.protocol !== "https:" || !(mockup.hostname.endsWith(".redbubble.net") || mockup.hostname.endsWith(".redbubble.com"))) {
        invalid("listing.extra.mockupTshirt", "Expected an HTTPS image on a Redbubble image host");
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
