import { httpUrl, invalid, isoTimestamp, strictObject, text } from "@/lib/listings";

export const SOCIAL_CHANNELS = ["pinterest", "bluesky", "mastodon", "instagram", "threads", "reddit", "tiktok", "youtube", "x", "linkedin"] as const;
export type SocialChannel = typeof SOCIAL_CHANNELS[number];
export type SocialPostStatus = "published" | "removed";
export type SocialPostInput = {
  channel: SocialChannel;
  account: string;
  variant: string;
  externalId: string;
  url: string;
  status: SocialPostStatus;
  publishedAt: string;
  linkUrl?: string;
  title?: string;
  caption?: string;
  hashtags?: string[];
  imageUrl?: string;
  board?: string;
  removedAt?: string;
  extra?: Record<string, unknown>;
};
export type SocialPostIngestInput = {
  design: { sha256?: string; sourceImageId?: number };
  post: SocialPostInput;
};
export type SocialPost = {
  id: string;
  designId: string;
  channel: SocialChannel;
  account: string;
  variant: string;
  externalId: string;
  url: string;
  linkUrl: string | null;
  title: string | null;
  caption: string | null;
  hashtags: string[] | null;
  imageUrl: string | null;
  board: string | null;
  status: SocialPostStatus;
  publishedAt: string;
  removedAt: string | null;
  extra: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};
export type SocialPostIngestResult = {
  design: { id: string; slug: string | null; title: string; sha256: string | null; sourceImageId: number | null };
  post: SocialPost;
  created: boolean;
};
export type SocialPostFilters = {
  sha256?: string;
  sourceImageId?: number;
  channel?: SocialChannel;
  account?: string;
  status?: SocialPostStatus;
  since?: string;
  until?: string;
  q?: string;
  page: number;
  limit: number;
};
export type SocialPostList = {
  data: { post: SocialPost; design: { id: string; slug: string | null; title: string } }[];
  pagination: { page: number; limit: number; total: number };
};
export type SocialSummaryFilters = { since?: string; until?: string };
export type SocialSummaryRow = { channel: SocialChannel; account: string; status: SocialPostStatus; count: number };

const onDomains = (...domains: string[]) => (host: string) => domains.some(d => host === d || host.endsWith(`.${d}`));
// pinterest.<tld> or pinterest.<co|com>.<cc>; look-alikes such as pinterest.evil.com / notpinterest.com stay rejected.
const CHANNEL_HOSTS: Record<SocialChannel, ((host: string) => boolean) | null> = {
  pinterest: host => /(^|\.)pinterest\.(?:[a-z]{2,3}|(?:co|com)\.[a-z]{2})$/.test(host),
  bluesky: onDomains("bsky.app"),
  mastodon: null, // instances are self-hosted: any host
  instagram: onDomains("instagram.com"),
  threads: onDomains("threads.net", "threads.com"),
  reddit: onDomains("reddit.com"),
  tiktok: onDomains("tiktok.com"),
  youtube: onDomains("youtube.com", "youtu.be"),
  x: onDomains("x.com", "twitter.com"),
  linkedin: onDomains("linkedin.com"),
};

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) invalid(field, `Expected one of: ${allowed.join(", ")}`);
  return value as T;
}

function sha(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) invalid(field, "Expected a 64-character hexadecimal SHA-256");
  return value.toLowerCase();
}

function positiveInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) invalid(field, "Expected a positive safe integer");
  return value;
}

export function parseSocialPostInput(value: unknown): SocialPostIngestInput {
  const body = strictObject(value, "", ["design", "post"]);
  const d = strictObject(body.design, "design", ["sha256", "sourceImageId"]);
  const p = strictObject(body.post, "post", ["channel", "account", "variant", "externalId", "url", "linkUrl", "title", "caption", "hashtags", "imageUrl", "board", "status", "publishedAt", "removedAt", "extra"]);
  if (d.sha256 === undefined && d.sourceImageId === undefined) invalid("design", "Provide sha256 or sourceImageId");
  const design: SocialPostIngestInput["design"] = {};
  if (d.sha256 !== undefined) design.sha256 = sha(d.sha256, "design.sha256");
  if (d.sourceImageId !== undefined) design.sourceImageId = positiveInt(d.sourceImageId, "design.sourceImageId");
  const post: SocialPostInput = {
    channel: oneOf(p.channel, "post.channel", SOCIAL_CHANNELS),
    account: text(p.account, "post.account", 100),
    variant: text(p.variant, "post.variant", 50),
    externalId: text(p.externalId, "post.externalId", 200),
    url: httpUrl(p.url, "post.url"),
    status: oneOf(p.status, "post.status", ["published", "removed"] as const),
    publishedAt: isoTimestamp(p.publishedAt, "post.publishedAt"),
  };
  const matches = CHANNEL_HOSTS[post.channel];
  if (matches && !matches(new URL(post.url).hostname.toLowerCase())) invalid("post.url", `URL host does not belong to ${post.channel}`);
  if (p.linkUrl !== undefined) post.linkUrl = httpUrl(p.linkUrl, "post.linkUrl");
  if (p.title !== undefined) post.title = text(p.title, "post.title", 500);
  if (p.caption !== undefined) post.caption = text(p.caption, "post.caption", 5000);
  if (p.hashtags !== undefined) {
    if (!Array.isArray(p.hashtags) || p.hashtags.length > 50) invalid("post.hashtags", "Expected at most 50 hashtags");
    post.hashtags = p.hashtags.map((tag, index) => text(tag, `post.hashtags.${index}`, 100));
  }
  if (p.imageUrl !== undefined) post.imageUrl = httpUrl(p.imageUrl, "post.imageUrl");
  if (p.board !== undefined) post.board = text(p.board, "post.board", 200);
  if (p.removedAt !== undefined) {
    if (post.status === "published") invalid("post.removedAt", "removedAt is not allowed while status is published");
    post.removedAt = isoTimestamp(p.removedAt, "post.removedAt");
  } else if (post.status === "removed") invalid("post.removedAt", "removedAt is required when status is removed");
  if (p.extra !== undefined) {
    if (!p.extra || typeof p.extra !== "object" || Array.isArray(p.extra)) invalid("post.extra", "Expected an object");
    if (Buffer.byteLength(JSON.stringify(p.extra), "utf8") > 16 * 1024) invalid("post.extra", "extra exceeds 16 KiB");
    post.extra = p.extra as Record<string, unknown>;
  }
  return { design, post };
}

function checkedQuery(params: URLSearchParams, allowed: string[]): void {
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (!allowed.includes(key)) invalid(key, "Unknown query parameter");
    if (seen.has(key)) invalid(key, "Duplicate query parameter");
    seen.add(key);
  }
}

function range(params: URLSearchParams): SocialSummaryFilters {
  const out: SocialSummaryFilters = {};
  if (params.has("since")) out.since = isoTimestamp(params.get("since"), "since");
  if (params.has("until")) out.until = isoTimestamp(params.get("until"), "until");
  if (out.since && out.until && out.since > out.until) invalid("since", "since must not be after until");
  return out;
}

export function parseSocialPostQuery(params: URLSearchParams): SocialPostFilters {
  checkedQuery(params, ["sha256", "sourceImageId", "channel", "account", "status", "since", "until", "q", "page", "limit"]);
  if (params.has("sha256") && params.has("sourceImageId")) invalid("query", "Provide at most one of sha256 or sourceImageId");
  const filters: SocialPostFilters = { ...range(params), page: 1, limit: 50 };
  if (params.has("sha256")) filters.sha256 = sha(params.get("sha256"), "sha256");
  if (params.has("sourceImageId")) {
    const raw = params.get("sourceImageId")!;
    if (!/^[1-9]\d*$/.test(raw)) invalid("sourceImageId", "Expected a positive integer");
    filters.sourceImageId = positiveInt(Number(raw), "sourceImageId");
  }
  if (params.has("channel")) filters.channel = oneOf(params.get("channel"), "channel", SOCIAL_CHANNELS);
  if (params.has("account")) filters.account = text(params.get("account"), "account", 100);
  if (params.has("status")) filters.status = oneOf(params.get("status"), "status", ["published", "removed"] as const);
  if (params.has("q")) {
    const q = params.get("q")!.trim();
    if (!q || q.length > 200) invalid("q", "Expected a non-empty string of at most 200 characters");
    filters.q = q;
  }
  if (params.has("page")) {
    const raw = params.get("page")!;
    if (!/^[1-9]\d{0,8}$/.test(raw)) invalid("page", "Expected an integer of at least 1");
    filters.page = Number(raw);
  }
  if (params.has("limit")) {
    const raw = params.get("limit")!;
    if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 200) invalid("limit", "Expected an integer from 1 to 200");
    filters.limit = Number(raw);
  }
  return filters;
}

export function parseSummaryQuery(params: URLSearchParams): SocialSummaryFilters {
  checkedQuery(params, ["since", "until"]);
  return range(params);
}
