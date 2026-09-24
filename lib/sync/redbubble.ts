import { load } from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

// Options needed to scrape Redbubble, independent of where the result ends up — lets
// callers (e.g. the CLI's `--target=json`) fetch without ever touching Supabase.
export type RedbubbleScrapeOptions = {
  shopUrl: string;
  maxPages?: number;
  pageDelayMs?: number;
  concurrency?: number;
  minRequestIntervalMs?: number;
  jitterMs?: number;
  requestHeaders?: Record<string, string>;
  usePlaywright?: boolean;
  playwrightHeadless?: boolean;
  playwrightStorageStatePath?: string;
};

export type RedbubbleSyncOptions = RedbubbleScrapeOptions & {
  supabaseUrl: string;
  supabaseKey: string;
  dryRun?: boolean;
};

type DesignRecord = {
  externalId: number;
  title: string;
  description: string;
  keywords: string;
  externalLink: string;
  externalImageUrl: string;
  category: string;
  collection: string;
  collections?: string[];
  imageName: string;
  backgroundColor: string;
  backgroundColors: string;
  shared: boolean;
  props: object;
  createdAt?: string;
  updatedAt?: string;
};

export type RedbubbleCollection = {
  externalId: number;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
};

export type ParsedShopPage = {
  designs: DesignRecord[];
  collections: RedbubbleCollection[];
  filteredCollection: RedbubbleCollection | null;
  totalPages: number;
};

export type SyncResult = {
  fetchedProductLinks: number;
  parsedProducts: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
  dryRun: boolean;
  warnings: string[];
  collections: { found: number; upserted: number; links: number };
  plan?: {
    insert: object[];
    update: object[];
    collections?: object[];
    links?: { externalId: number; collections: number[] }[];
  };
};

const EXISTING_ROW_COLUMNS =
  "id, externalId, title, description, keywords, category, collection, backgroundColor, backgroundColors, shared, props, imageName, externalImageUrl, externalLink, createdAt";

const DESIGN_ID_LOOKUP_COLUMNS = "id, externalId";

type ExistingRow = {
  id: string;
  externalId: number;
  title: string;
  description: string;
  keywords: string;
  category: string;
  collection: string;
  backgroundColor: string;
  backgroundColors: string;
  shared: boolean;
  props: object;
  imageName: string;
  externalImageUrl: string;
  externalLink: string;
  createdAt: string;
};

const DEFAULT_VALUES: Record<string, string> = {
  category: "no_category",
  collection: "no_collection",
};

function isEmptyOrDefault(field: string, value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  const defaultValue = DEFAULT_VALUES[field];
  return defaultValue !== undefined && value === defaultValue;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// PostgREST quoted-value list for `.filter(col, "in", list)`. Values containing
// `,`, `(`, `)`, or whitespace must be double-quoted; embedded `"` and `\` must be escaped.
// (`.in()` quotes but does not escape, which breaks on titles containing a `"`.)
function toPostgrestInList(values: string[]): string {
  const quoted = values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `(${quoted.join(",")})`;
}

const defaultHeaders = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "cache-control": "no-cache",
  pragma: "no-cache",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RequestPacer {
  private lastRequestAt = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly minIntervalMs: number,
    private readonly jitterMs: number,
  ) {
    this.minIntervalMs = Math.max(0, minIntervalMs);
    this.jitterMs = Math.max(0, jitterMs);
  }

  async waitTurn(): Promise<void> {
    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const elapsed = now - this.lastRequestAt;
      const baseWait = Math.max(0, this.minIntervalMs - elapsed);
      const jitter = this.jitterMs > 0 ? Math.floor(Math.random() * this.jitterMs) : 0;
      const totalWait = baseWait + jitter;
      if (totalWait > 0) {
        await sleep(totalWait);
      }
      this.lastRequestAt = Date.now();
    });
    return this.queue;
  }
}

const TRUSTED_HOSTS = new Set(["www.redbubble.com", "redbubble.com"]);

export function normalizeShopUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  if (trimmed.includes("://") || trimmed.startsWith("//")) {
    try {
      const parsed = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
      if (parsed.protocol !== "https:") {
        return "";
      }
      if (!TRUSTED_HOSTS.has(parsed.hostname.toLowerCase())) {
        return "";
      }
      if (parsed.pathname.includes("/explore")) {
        parsed.pathname = parsed.pathname.replace("/explore", "/shop");
      }
      return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
    } catch {
      return "";
    }
  }

  if (trimmed.startsWith("www.redbubble.com/") || trimmed.startsWith("redbubble.com/")) {
    try {
      const parsed = new URL(`https://${trimmed}`);
      if (parsed.pathname.includes("/explore")) {
        parsed.pathname = parsed.pathname.replace("/explore", "/shop");
      }
      return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
    } catch {
      return "";
    }
  }

  if (trimmed.includes("/") || trimmed.includes("?") || trimmed.includes("#")) {
    return "";
  }

  const rawUsername = trimmed.replace(/^@/, "");
  if (!/^[a-zA-Z0-9_-]+$/.test(rawUsername)) {
    return "";
  }
  return `https://www.redbubble.com/people/${rawUsername}/shop`;
}

function buildShopPageUrl(base: string, page: number): string {
  const url = new URL(base);
  url.searchParams.set("page", String(page));
  return url.toString();
}

function buildCollectionPageUrl(base: string, collectionExternalId: number, page: number): string {
  const url = new URL(base);
  url.searchParams.set("collections", String(collectionExternalId));
  url.searchParams.set("page", String(page));
  return url.toString();
}

export function extractExternalIdFromUrl(url: string): number | null {
  const match = url.match(
    /(?:\/shop\/ap\/|\/works\/|\/i\/[^\/]+\/[^\/]+\/|[\/-])([0-9]{5,})(?:\.[a-z0-9]+|-[^\/?#]+|\/|\?|#|$)/i,
  );
  if (match && match[1]) {
    return Number(match[1]);
  }
  const fallback = url.match(/([0-9]{6,})/);
  return fallback ? Number(fallback[1]) : null;
}

function extractCategoryFromUrl(url: string): string {
  const match = url.match(/\/i\/([^\/]+)\//i);
  return match?.[1] ? match[1].replace(/[-_]/g, " ") : "no_category";
}

function extractCollection($: ReturnType<typeof load>): string {
  const collectionLink = $("a[href*='/collections/']").first();
  if (collectionLink.length) {
    return collectionLink.text().trim() || "no_collection";
  }
  const portfolioLink = $("a[href*='/portfolio/']").first();
  if (portfolioLink.length) {
    return portfolioLink.text().trim() || "no_collection";
  }
  return "no_collection";
}

function parseJsonLd($: ReturnType<typeof load>): Record<string, unknown> | null {
  const scripts = $("script[type='application/ld+json']");
  for (const el of scripts.toArray()) {
    const raw = $(el).text().trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        const product = data.find((item) => item && item["@type"] === "Product");
        if (product) return product as Record<string, unknown>;
      }
      if (data && data["@type"] === "Product") return data as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return null;
}

function sanitizeText(value: string | undefined | null): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function getImageName(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const parts = pathname.split("/");
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}

function parseProductHtml(html: string, pageUrl: string): DesignRecord | null {
  const $ = load(html);
  const jsonLd = parseJsonLd($);

  const ogTitle = $("meta[property='og:title']").attr("content");
  const ogDescription = $("meta[property='og:description']").attr("content");
  const ogImage = $("meta[property='og:image']").attr("content");
  const ogUrl = $("meta[property='og:url']").attr("content");
  const keywords = $("meta[name='keywords']").attr("content");

  const title =
    sanitizeText((jsonLd?.name as string) || ogTitle || $("h1").first().text());
  const description = sanitizeText(
    (jsonLd?.description as string) || ogDescription || "",
  );
  const image = sanitizeText(
    (Array.isArray(jsonLd?.image) ? jsonLd?.image?.[0] : jsonLd?.image) as string,
  );
  const imageUrl = image || ogImage || "";
  const url = sanitizeText((jsonLd?.url as string) || ogUrl || pageUrl);

  const externalId = extractExternalIdFromUrl(url) || extractExternalIdFromUrl(pageUrl);
  if (!externalId || !title || !imageUrl) return null;

  const collection = extractCollection($);
  const category = extractCategoryFromUrl(url);

  return {
    externalId,
    title,
    description: description || "",
    keywords: sanitizeText(keywords || ""),
    externalLink: url,
    externalImageUrl: imageUrl,
    category,
    collection,
    imageName: getImageName(imageUrl),
    backgroundColor: "#FFFFFF",
    backgroundColors: "",
    shared: true,
    props: {
      source: "redbubble",
      rawUrl: pageUrl,
    },
  };
}

function getRequestHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...defaultHeaders,
    ...(extra || {}),
  };
}

function isCloudflareChallengePage(html: string): boolean {
  return (
    /Just a moment/i.test(html) ||
    /Verifying you are human/i.test(html) ||
    /Verify you are human/i.test(html) ||
    /cf-browser-verification/i.test(html) ||
    /challenges\.cloudflare\.com/i.test(html)
  );
}

async function fetchHtml(url: string, extraHeaders?: Record<string, string>): Promise<string> {
  const response = await fetch(url, { headers: getRequestHeaders(extraHeaders) });

  const body = await response.text();
  if (!response.ok) {
    if (response.status === 403 && isCloudflareChallengePage(body)) {
      throw new Error(
        "Redbubble blocked automated access with Cloudflare challenge. " +
          "Set REDBUBBLE_COOKIE and REDBUBBLE_USER_AGENT from a real browser session.",
      );
    }
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  if (isCloudflareChallengePage(body)) {
    throw new Error(
      "Redbubble returned Cloudflare challenge page. " +
        "Set REDBUBBLE_COOKIE and REDBUBBLE_USER_AGENT from a real browser session.",
    );
  }

  return body;
}

// ---------------------------------------------------------------------------
// __NEXT_DATA__ parsing (shop listing + collection-filtered listing pages)
// ---------------------------------------------------------------------------

type RbPreview = { previewTypeId?: string; url?: string };
type RbWork = { id?: string | number; title?: string; tags?: string[] };
type RbInventoryItem = {
  productPageUrl?: string;
  previewSet?: { previews?: RbPreview[] };
  work?: RbWork;
};
type RbResultEntry = { inventoryItem?: RbInventoryItem };
type RbCollectionRaw = {
  id?: number | string;
  title?: string;
  description?: string | null;
  coverImageUrl?: string | null;
};
type RbPageProps = {
  results?: RbResultEntry[];
  pagination?: { totalPages?: number } | null;
  artistInfo?: { collections?: RbCollectionRaw[] };
  filteredCollection?: RbCollectionRaw | null;
};
type RbNextData = { props?: { pageProps?: RbPageProps } };

function toRedbubbleCollection(raw: RbCollectionRaw | null | undefined): RedbubbleCollection | null {
  if (!raw) return null;
  const externalId = Number(raw.id);
  const title = sanitizeText(raw.title);
  if (!Number.isFinite(externalId) || !title) return null;
  return {
    externalId,
    title,
    description: raw.description ?? null,
    coverImageUrl: raw.coverImageUrl ?? null,
  };
}

export function parseShopNextData(html: string, pageUrl: string): ParsedShopPage {
  const $ = load(html);
  const raw = $("script#__NEXT_DATA__").first().text().trim();
  if (!raw) {
    throw new Error("Redbubble page has no __NEXT_DATA__ (layout changed or challenge page)");
  }

  let nextData: RbNextData;
  try {
    nextData = JSON.parse(raw) as RbNextData;
  } catch {
    throw new Error("Redbubble page has no __NEXT_DATA__ (layout changed or challenge page)");
  }

  const pageProps = nextData.props?.pageProps || {};

  const collections = (pageProps.artistInfo?.collections || [])
    .map(toRedbubbleCollection)
    .filter((c): c is RedbubbleCollection => c !== null);

  const filteredCollection = toRedbubbleCollection(pageProps.filteredCollection);
  const totalPages = pageProps.pagination?.totalPages ?? 1;

  const seen = new Set<number>();
  const designs: DesignRecord[] = [];
  for (const entry of pageProps.results || []) {
    const item = entry.inventoryItem;
    if (!item) continue;

    const externalId = Number(item.work?.id);
    const title = sanitizeText(item.work?.title);
    const link = item.productPageUrl || "";
    const previews = item.previewSet?.previews || [];
    const preferred = previews.find((p) => p.previewTypeId === "product_close");
    const imageUrl = (preferred || previews[0])?.url || "";

    if (!Number.isFinite(externalId) || !title || !link || !imageUrl) continue;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    designs.push({
      externalId,
      title,
      description: "",
      keywords: (item.work?.tags || []).join(", "),
      externalLink: link,
      externalImageUrl: imageUrl,
      category: extractCategoryFromUrl(link),
      collection: "no_collection",
      imageName: getImageName(imageUrl),
      backgroundColor: "#FFFFFF",
      backgroundColors: "",
      shared: true,
      props: { source: "redbubble", rawUrl: pageUrl },
    });
  }

  return { designs, collections, filteredCollection, totalPages };
}

function extractProductLinksFromHtml(html: string, pageUrl: string): string[] {
  const $ = load(html);
  const links = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    if (href.includes("/i/") || href.includes("/shop/ap/")) {
      try {
        const absolute = new URL(href, pageUrl).toString();
        links.add(absolute);
      } catch {
        return;
      }
    }
  });

  return Array.from(links);
}

async function fetchShopPage(
  pageUrl: string,
  requestHeaders?: Record<string, string>,
): Promise<{ links: string[]; parsed: ParsedShopPage | null }> {
  const html = await fetchHtml(pageUrl, requestHeaders);
  try {
    const parsed = parseShopNextData(html, pageUrl);
    return { links: parsed.designs.map((d) => d.externalLink), parsed };
  } catch {
    return { links: extractProductLinksFromHtml(html, pageUrl), parsed: null };
  }
}

async function crawlCollectionMembership(
  shopUrl: string,
  collections: RedbubbleCollection[],
  maxPages: number,
  pacer: RequestPacer,
  fetchPage: (url: string) => Promise<string>,
  errors: string[],
  warnings: string[],
): Promise<{ membership: Map<number, number[]>; complete: boolean }> {
  // Sets, not arrays: a design can appear on more than one page of the same collection
  // (paging overlap), and pushing the same collection id twice would create a duplicate
  // `(designId, collectionId)` row later and fail the whole write chunk.
  const membershipSets = new Map<number, Set<number>>();
  let complete = true;

  for (const collection of collections) {
    try {
      let page = 1;
      let totalPages = 1;
      do {
        const pageUrl = buildCollectionPageUrl(shopUrl, collection.externalId, page);
        await pacer.waitTurn();
        const html = await fetchPage(pageUrl);
        const parsed = parseShopNextData(html, pageUrl);
        totalPages = parsed.totalPages;
        for (const design of parsed.designs) {
          const set = membershipSets.get(design.externalId);
          if (set) {
            set.add(collection.externalId);
          } else {
            membershipSets.set(design.externalId, new Set([collection.externalId]));
          }
        }
        page += 1;
      } while (page <= Math.min(totalPages, maxPages));

      if (totalPages > maxPages) {
        // Only a prefix of the collection's pages was fetched — its membership is
        // incomplete, so the whole run must not overwrite collections/links from it.
        complete = false;
        warnings.push(
          `Collection "${collection.title}" truncated at maxPages=${maxPages} of totalPages=${totalPages}`,
        );
      }
    } catch (error) {
      errors.push(String(error));
      complete = false;
    }
  }

  const membership = new Map<number, number[]>();
  for (const [externalId, set] of membershipSets) {
    membership.set(externalId, Array.from(set));
  }

  return { membership, complete };
}

async function createPlaywrightSession(options: {
  requestHeaders?: Record<string, string>;
  headless: boolean;
  storageStatePath?: string;
}) {
  const browser = await chromium.launch({ headless: options.headless });
  const contextOptions: Parameters<typeof browser.newContext>[0] = {
    userAgent: options.requestHeaders?.["user-agent"],
    locale: "en-US",
    extraHTTPHeaders: options.requestHeaders,
  };

  if (options.storageStatePath && fs.existsSync(options.storageStatePath)) {
    contextOptions.storageState = options.storageStatePath;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    window.chrome = window.chrome || { runtime: {} };
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
  });

  return {
    async fetchHtml(url: string): Promise<string> {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      const body = await page.content();

      if (response && !response.ok()) {
        if (response.status() === 403 && isCloudflareChallengePage(body)) {
          throw new Error(
            "Redbubble blocked browser automation with Cloudflare challenge. " +
              "Run once with SYNC_PLAYWRIGHT_HEADLESS=false and complete challenge, then reuse SYNC_PLAYWRIGHT_STORAGE_STATE_PATH.",
          );
        }
        throw new Error(`Failed to fetch ${url}: ${response.status()}`);
      }

      if (isCloudflareChallengePage(body)) {
        throw new Error(
          "Redbubble returned Cloudflare challenge page. " +
            "Run once with SYNC_PLAYWRIGHT_HEADLESS=false and complete challenge, then reuse SYNC_PLAYWRIGHT_STORAGE_STATE_PATH.",
        );
      }

      return body;
    },
    async scrapeListingCards(pageUrl: string): Promise<ParsedShopPage> {
      const response = await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2000);
      const body = await page.content();

      if (response && !response.ok()) {
        if (response.status() === 403 && isCloudflareChallengePage(body)) {
          throw new Error(
            "Redbubble blocked browser automation with Cloudflare challenge. " +
              "Run once with SYNC_PLAYWRIGHT_HEADLESS=false and complete challenge, then reuse SYNC_PLAYWRIGHT_STORAGE_STATE_PATH.",
          );
        }
        throw new Error(`Failed to fetch ${pageUrl}: ${response.status()}`);
      }

      if (isCloudflareChallengePage(body)) {
        throw new Error(
          "Redbubble returned Cloudflare challenge page. " +
            "Run once with SYNC_PLAYWRIGHT_HEADLESS=false and complete challenge, then reuse SYNC_PLAYWRIGHT_STORAGE_STATE_PATH.",
        );
      }

      return parseShopNextData(body, pageUrl);
    },
    async close(): Promise<void> {
      try {
        if (options.storageStatePath) {
          const parent = path.dirname(options.storageStatePath);
          if (!fs.existsSync(parent)) {
            fs.mkdirSync(parent, { recursive: true });
          }
          await context.storageState({ path: options.storageStatePath }).catch(() => {});
        }
      } finally {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
      }
    },
  };
}

export async function getProductLinksFromShopPage(
  pageUrl: string,
  requestHeaders?: Record<string, string>,
): Promise<string[]> {
  const { links } = await fetchShopPage(pageUrl, requestHeaders);
  return links;
}

async function runWithConcurrency<T>(
  items: string[],
  limit: number,
  handler: (item: string) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      const result = await handler(item);
      results.push(result);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchRedbubbleDesigns(options: RedbubbleScrapeOptions): Promise<{
  productLinks: string[];
  designs: DesignRecord[];
  collections: RedbubbleCollection[];
  collectionsComplete: boolean;
  errors: string[];
  warnings: string[];
}> {
  const shopUrl = normalizeShopUrl(options.shopUrl);
  if (!shopUrl) {
    throw new Error("Missing Redbubble shop URL");
  }

  const maxPages = options.maxPages ?? 5;
  const pageDelayMs = options.pageDelayMs ?? 3000;
  const concurrency = options.concurrency ?? 1;
  const minRequestIntervalMs = options.minRequestIntervalMs ?? 2500;
  const jitterMs = options.jitterMs ?? 700;
  const usePlaywright = options.usePlaywright ?? true;
  const playwrightHeadless = options.playwrightHeadless ?? true;
  const playwrightStorageStatePath = options.playwrightStorageStatePath;
  const pacer = new RequestPacer(minRequestIntervalMs, jitterMs);
  const browserSession = usePlaywright
    ? await createPlaywrightSession({
        requestHeaders: options.requestHeaders,
        headless: playwrightHeadless,
        storageStatePath: playwrightStorageStatePath,
      })
    : null;

  const allProductLinks = new Set<string>();
  const errors: string[] = [];
  const warnings: string[] = [];
  const listingDesigns = new Map<number, DesignRecord>();
  let shopCollections: RedbubbleCollection[] = [];
  let nextDataAvailable = false;

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const pageUrl = buildShopPageUrl(shopUrl, page);
      try {
        await pacer.waitTurn();
        if (browserSession) {
          const parsed = await browserSession.scrapeListingCards(pageUrl);
          if (page === 1) {
            shopCollections = parsed.collections;
            nextDataAvailable = true;
          }
          if (!parsed.designs.length) break;
          parsed.designs.forEach((row) => listingDesigns.set(row.externalId, row));
          if (pageDelayMs > 0) await sleep(pageDelayMs);
          if (page >= parsed.totalPages) break;
        } else {
          const { links, parsed } = await fetchShopPage(pageUrl, options.requestHeaders);
          if (page === 1 && parsed) {
            shopCollections = parsed.collections;
            nextDataAvailable = true;
          }
          if (!links.length) break;
          links.forEach((link) => allProductLinks.add(link));
          if (pageDelayMs > 0) await sleep(pageDelayMs);
          if (parsed && page >= parsed.totalPages) break;
        }
      } catch (error) {
        errors.push(String(error));
        break;
      }
    }

    const productLinks = Array.from(allProductLinks);
    const designs = browserSession
      ? Array.from(listingDesigns.values())
      : await runWithConcurrency(productLinks, concurrency, async (url) => {
          try {
            await pacer.waitTurn();
            const html = await fetchHtml(url, options.requestHeaders);
            return parseProductHtml(html, url);
          } catch (error) {
            errors.push(String(error));
            return null;
          }
        });

    const filtered = designs.filter((design): design is DesignRecord => !!design);

    let membership = new Map<number, number[]>();
    let collectionsComplete = nextDataAvailable;
    if (nextDataAvailable && shopCollections.length) {
      const fetchPage = browserSession
        ? (url: string) => browserSession.fetchHtml(url)
        : (url: string) => fetchHtml(url, options.requestHeaders);
      const crawl = await crawlCollectionMembership(
        shopUrl,
        shopCollections,
        maxPages,
        pacer,
        fetchPage,
        errors,
        warnings,
      );
      membership = crawl.membership;
      collectionsComplete = crawl.complete;
    }

    if (nextDataAvailable) {
      const titleById = new Map(shopCollections.map((c) => [c.externalId, c.title]));
      for (const design of filtered) {
        const ids = membership.get(design.externalId) || [];
        const titles = ids.map((id) => titleById.get(id)).filter((t): t is string => !!t);
        design.collections = titles;
        design.collection = titles[0] || "no_collection";
      }
    }

    return {
      productLinks: browserSession ? filtered.map((d) => d.externalLink) : productLinks,
      designs: filtered,
      collections: shopCollections,
      collectionsComplete,
      errors,
      warnings,
    };
  } finally {
    if (browserSession) {
      await browserSession.close();
    }
  }
}

type RedbubbleFetchResult = Awaited<ReturnType<typeof fetchRedbubbleDesigns>>;

// Split from `syncRedbubbleToSupabase` so callers that also need the raw scrape (e.g. the
// CLI's `--target=both`) can fetch once and reuse the result instead of scraping twice.
export async function writeDesignsToSupabase(
  fetchResult: RedbubbleFetchResult,
  options: Pick<RedbubbleSyncOptions, "supabaseUrl" | "supabaseKey" | "dryRun">,
): Promise<SyncResult> {
  const { productLinks, designs, collections, collectionsComplete, errors, warnings: fetchWarnings } =
    fetchResult;
  const dryRun = options.dryRun ?? false;

  const supabase = createClient(options.supabaseUrl, options.supabaseKey);
  // `collections` (the per-design title list) is derived, UI-facing data — the `designs`
  // table only stores the flat `collection` column, so it must never be sent as a column.
  const rows = designs.map((design) => {
    const rest: DesignRecord = { ...design };
    delete rest.collections;
    return { ...rest, updatedAt: new Date().toISOString() };
  });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errorsCount = errors.length;
  const errorMessages = [...errors];
  const warnings: string[] = [...fetchWarnings];
  if (!collectionsComplete && collections.length) {
    warnings.push(
      "Collections crawl incomplete: skipped collection sync and kept the fill-if-empty rule for the collection field.",
    );
  }

  const collectionByTitle = new Map(collections.map((c) => [c.title, c]));

  const insertRows: (typeof rows)[0][] = [];
  const updateRows: (typeof rows)[0][] = [];

  if (!rows.length && productLinks.length) {
    // Nothing parsed but links were found (e.g. every product page was Cloudflare-blocked):
    // report them as skipped rather than silently dropping them from the summary.
    skipped = productLinks.length;
  }

  if (rows.length) {
    const uniqueMap = new Map<number, (typeof rows)[0]>();
    for (const r of rows) {
      uniqueMap.set(r.externalId, r);
    }
    const dedupedByExternalId = Array.from(uniqueMap.values());

    const titleOwner = new Map<string, number>();
    const batchRows: (typeof rows)[0][] = [];
    for (const r of dedupedByExternalId) {
      const owner = titleOwner.get(r.title);
      if (owner !== undefined && owner !== r.externalId) {
        skipped++;
        warnings.push(
          `Skipped externalId ${r.externalId}: title "${r.title}" duplicates externalId ${owner} in this batch`,
        );
        continue;
      }
      titleOwner.set(r.title, r.externalId);
      batchRows.push(r);
    }

    if (batchRows.length) {
      // Rows whose id-lookup or title-lookup chunk fails must never be written — we can't
      // know whether they already exist or collide with another title in the DB.
      const failedExternalIds = new Set<number>();

      const existingById = new Map<number, ExistingRow>();
      for (const rowChunk of chunk(batchRows, 100)) {
        const idChunk = rowChunk.map((r) => r.externalId);
        const { data, error } = await supabase
          .from("designs")
          .select(EXISTING_ROW_COLUMNS)
          .in("externalId", idChunk);
        if (error) {
          errorMessages.push(error.message);
          idChunk.forEach((id) => failedExternalIds.add(id));
          continue;
        }
        for (const row of (data as ExistingRow[] | null) || []) {
          existingById.set(row.externalId, row);
        }
      }

      // Smaller chunk size than the numeric-id lookup: quoted string values inflate the
      // PostgREST filter query string and risk hitting a 414/431 URL-length limit.
      const titleOwnerInDb = new Map<string, number>();
      for (const rowChunk of chunk(batchRows, 25)) {
        const titleChunk = rowChunk.map((r) => r.title);
        const { data, error } = await supabase
          .from("designs")
          .select("externalId, title")
          .filter("title", "in", toPostgrestInList(titleChunk));
        if (error) {
          errorMessages.push(error.message);
          rowChunk.forEach((r) => failedExternalIds.add(r.externalId));
          continue;
        }
        for (const row of (data as { externalId: number; title: string }[] | null) || []) {
          titleOwnerInDb.set(row.title, row.externalId);
        }
      }

      errorsCount += failedExternalIds.size;

      for (const r of batchRows) {
        if (failedExternalIds.has(r.externalId)) {
          continue;
        }

        const dbOwner = titleOwnerInDb.get(r.title);
        if (dbOwner !== undefined && dbOwner !== r.externalId) {
          skipped++;
          warnings.push(
            `Skipped externalId ${r.externalId}: title "${r.title}" already used by externalId ${dbOwner} in the database`,
          );
          continue;
        }

        const existing = existingById.get(r.externalId);
        if (existing) {
          const updateRow: Record<string, unknown> = {
            ...existing,
            title: r.title,
            externalLink: r.externalLink,
            externalImageUrl: r.externalImageUrl,
            imageName: r.imageName,
            updatedAt: r.updatedAt,
          };
          for (const field of ["description", "keywords", "category"] as const) {
            if (isEmptyOrDefault(field, existing[field]) && !isEmptyOrDefault(field, r[field])) {
              updateRow[field] = r[field];
            }
          }
          // Redbubble is the source of truth for `collection` once the collections crawl
          // succeeded; otherwise fall back to the old fill-if-empty rule.
          if (collectionsComplete) {
            updateRow.collection = r.collection;
          } else if (isEmptyOrDefault("collection", existing.collection) && !isEmptyOrDefault("collection", r.collection)) {
            updateRow.collection = r.collection;
          }
          updateRows.push(updateRow as (typeof rows)[0]);
        } else {
          insertRows.push(r);
        }
      }
    }
  }

  const baseResult = (): Omit<SyncResult, "inserted" | "updated" | "skipped" | "errors" | "collections"> => ({
    fetchedProductLinks: productLinks.length,
    parsedProducts: designs.length,
    errorMessages,
    dryRun,
    warnings,
  });

  if (dryRun) {
    const collectionsPlan = collections.map((c) => ({
      externalId: c.externalId,
      title: c.title,
      description: c.description,
      coverImageUrl: c.coverImageUrl,
    }));
    const plannedExternalIds = new Set(
      [...insertRows, ...updateRows].map((r) => (r as { externalId: number }).externalId),
    );
    const linksPlan = designs
      .filter((d) => plannedExternalIds.has(d.externalId))
      .map((d) => ({
        externalId: d.externalId,
        collections: (d.collections || [])
          .map((title) => collectionByTitle.get(title)?.externalId)
          .filter((id): id is number => id !== undefined),
      }));

    return {
      ...baseResult(),
      inserted: insertRows.length,
      updated: updateRows.length,
      skipped,
      errors: errorsCount,
      plan: { insert: insertRows, update: updateRows, collections: collectionsPlan, links: linksPlan },
      collections: { found: collections.length, upserted: 0, links: 0 },
    };
  }

  const successfulExternalIds: number[] = [];

  for (const insertChunk of chunk(insertRows, 100)) {
    const { data, error } = await supabase.from("designs").insert(insertChunk).select("id");
    if (error) {
      errorsCount += insertChunk.length;
      errorMessages.push(error.message);
    } else {
      inserted += data?.length || 0;
      insertChunk.forEach((r) => successfulExternalIds.push((r as { externalId: number }).externalId));
    }
  }

  for (const updateChunk of chunk(updateRows, 100)) {
    const { data, error } = await supabase
      .from("designs")
      .upsert(updateChunk, { onConflict: "externalId" })
      .select("id");
    if (error) {
      errorsCount += updateChunk.length;
      errorMessages.push(error.message);
    } else {
      updated += data?.length || 0;
      updateChunk.forEach((r) => successfulExternalIds.push((r as { externalId: number }).externalId));
    }
  }

  let collectionsUpserted = 0;
  let linksWritten = 0;

  if (collectionsComplete && collections.length) {
    const nowIso = new Date().toISOString();
    const collectionRows = collections.map((c) => ({
      externalId: c.externalId,
      title: c.title,
      description: c.description,
      coverImageUrl: c.coverImageUrl,
      updatedAt: nowIso,
    }));

    const collectionIdByExternalId = new Map<number, string>();
    let collectionsUpsertOk = true;
    for (const rowChunk of chunk(collectionRows, 100)) {
      const { data, error } = await supabase
        .from("collections")
        .upsert(rowChunk, { onConflict: "externalId" })
        .select("id, externalId");
      if (error) {
        collectionsUpsertOk = false;
        errorsCount += rowChunk.length;
        errorMessages.push(error.message);
        continue;
      }
      collectionsUpserted += data?.length || 0;
      for (const row of (data as { id: string; externalId: number }[] | null) || []) {
        collectionIdByExternalId.set(row.externalId, row.id);
      }
    }

    if (!collectionsUpsertOk) {
      // A failed collections-upsert chunk means `collectionIdByExternalId` (and therefore
      // `currentCollectionUuids`) is missing some still-valid collections — the "remove
      // links to collections no longer in this run's fetch" delete would then wrongly
      // treat those as gone and delete their links. Skip the whole design_collections
      // phase rather than write/delete from an incomplete collection set.
      warnings.push("Skipped collection links: collections upsert failed");
    } else if (successfulExternalIds.length) {
      const designIdByExternalId = new Map<number, string>();
      for (const idChunk of chunk(successfulExternalIds, 100)) {
        const { data, error } = await supabase
          .from("designs")
          .select(DESIGN_ID_LOOKUP_COLUMNS)
          .in("externalId", idChunk);
        if (error) {
          errorsCount += idChunk.length;
          errorMessages.push(error.message);
          continue;
        }
        for (const row of (data as { id: string; externalId: number }[] | null) || []) {
          designIdByExternalId.set(row.externalId, row.id);
        }
      }

      const designByExternalId = new Map(designs.map((d) => [d.externalId, d]));
      const currentCollectionUuids = Array.from(collectionIdByExternalId.values());

      // Written per chunk of designs, upsert-before-delete: a failed upsert leaves the
      // chunk's existing links untouched (never delete-first, which would zero out a
      // design's links if the following insert then failed).
      for (const idChunk of chunk(Array.from(designIdByExternalId.entries()), 100)) {
        const chunkDesignIds = idChunk.map(([, designId]) => designId);
        const memberCollectionIdsByDesignId = new Map<string, Set<string>>();
        const newLinkRows: { designId: string; collectionId: string }[] = [];

        for (const [externalId, designId] of idChunk) {
          const design = designByExternalId.get(externalId);
          const memberIds = new Set<string>();
          for (const title of design?.collections || []) {
            const collection = collectionByTitle.get(title);
            const collectionId = collection ? collectionIdByExternalId.get(collection.externalId) : undefined;
            if (collectionId) {
              memberIds.add(collectionId);
              newLinkRows.push({ designId, collectionId });
            }
          }
          memberCollectionIdsByDesignId.set(designId, memberIds);
        }

        let upsertOk = true;
        if (newLinkRows.length) {
          const { data, error } = await supabase
            .from("design_collections")
            .upsert(newLinkRows, { onConflict: "designId,collectionId", ignoreDuplicates: true })
            .select();
          if (error) {
            upsertOk = false;
            errorsCount += chunkDesignIds.length;
            errorMessages.push(error.message);
          } else {
            linksWritten += data?.length ?? newLinkRows.length;
          }
        }

        if (!upsertOk) continue;

        // Remove links for collections the design is no longer a member of, one delete
        // per known collection scoped to this chunk (skipped when nothing to remove).
        for (const collection of collections) {
          const collectionId = collectionIdByExternalId.get(collection.externalId);
          if (!collectionId) continue;
          const nonMemberDesignIds = chunkDesignIds.filter(
            (designId) => !memberCollectionIdsByDesignId.get(designId)?.has(collectionId),
          );
          if (!nonMemberDesignIds.length) continue;
          const { error } = await supabase
            .from("design_collections")
            .delete()
            .eq("collectionId", collectionId)
            .in("designId", nonMemberDesignIds);
          if (error) {
            errorsCount += nonMemberDesignIds.length;
            errorMessages.push(error.message);
          }
        }

        // Remove links to collections that no longer exist at all in this run's fetch.
        if (currentCollectionUuids.length) {
          const { error } = await supabase
            .from("design_collections")
            .delete()
            .in("designId", chunkDesignIds)
            .not("collectionId", "in", toPostgrestInList(currentCollectionUuids));
          if (error) {
            errorsCount += chunkDesignIds.length;
            errorMessages.push(error.message);
          }
        }
      }
    }
  }

  return {
    ...baseResult(),
    inserted,
    updated,
    skipped,
    errors: errorsCount,
    collections: { found: collections.length, upserted: collectionsUpserted, links: linksWritten },
  };
}

export async function syncRedbubbleToSupabase(options: RedbubbleSyncOptions): Promise<SyncResult> {
  const fetchResult = await fetchRedbubbleDesigns(options);
  return writeDesignsToSupabase(fetchResult, options);
}
