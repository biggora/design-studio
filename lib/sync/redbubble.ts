import { load } from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { designSlugBase, uniqueSlug } from "@/lib/slug";
import { buildBackgroundImageUrl, extractMockupToken, tokenToHex } from "@/lib/background";

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
  imageName: string | null;
  backgroundColor: string;
  backgroundColors: string;
  shared: boolean;
  props: object | null;
  slug?: string;
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
    update: { externalId: number; collection?: string; props?: object }[];
    collections?: object[];
    links?: { externalId: number; collections: number[] }[];
  };
};

// Used to check whether a design already exists in the database and, for props.mockup_tshirt
// backfill, to read its current `props` (to know whether a mockup is already stored, and to
// preserve any other keys already in it) — its full curated content is otherwise never read;
// nothing but `collection`/`props`/`updatedAt` may be sent back on update.
const EXISTENCE_CHECK_COLUMNS = "externalId, props";

// Used once a design is known to exist/have just been written, to resolve its uuid `id`
// for the design_collections write.
const DESIGN_ID_LOOKUP_COLUMNS = "id, externalId";

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
  url.searchParams.set("sortOrder", "recent");
  return url.toString();
}

function buildCollectionPageUrl(base: string, collectionExternalId: number, page: number): string {
  const url = new URL(base);
  url.searchParams.set("collections", String(collectionExternalId));
  url.searchParams.set("page", String(page));
  url.searchParams.set("sortOrder", "recent");
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

// The "all products with this design" page — used by the site's buy button and, here, as
// the canonical `externalLink` for a design (matches the format of every existing row).
function buildShopApUrl(workId: number): string {
  return `https://www.redbubble.com/shop/ap/${workId}`;
}

// Builds the flat, full-artwork image URL from any preview URL for the same work
// (`https://<host>/image.<A>.<B>/<variant>...` -> `.../flat,500x,075,f.u2.jpg`), matching
// the format of every existing row's `externalImageUrl`.
export function buildArtworkImageUrl(previewUrl: string): string {
  const match = previewUrl.match(/^(https:\/\/[a-z0-9.-]+\/image\.[^/]+)\//i);
  if (!match) return previewUrl;
  return `${match[1]}/flat,500x,075,f.u2.jpg`;
}

// Extracts the artist's own Classic T-Shirt mockup color for this work from a
// `/shop/ap/<workId>` page's HTML (Apollo state, where slashes are encoded as `{{%2F}}`).
// The page also embeds Classic T-Shirt previews for *related* works — the preview image id's
// suffix (the part after the dot) equals the last 4 digits of the work id it belongs to, so
// matching on `<last4>` picks this work's own preview and ignores the others. Returns null
// when no matching preview is found (e.g. layout change, or the work has no Classic T-Shirt
// listing). Adult tees only support the `tall_portrait` aspect for the flatlay variant.
export function extractClassicTeeMockupUrl(html: string, workId: number): string | null {
  const decoded = html.replace(/\{\{%2F\}\}/g, "/");
  const last4 = String(workId).slice(-4);
  const pattern = new RegExp(
    `https://(ih\\d\\.redbubble\\.net)/image\\.(\\d+)\\.${last4}/ssrco,classic_tee,[a-z0-9_]+,([0-9a-f]{6}(?:~[0-9a-f]{6})?:[0-9a-f]{10}),`,
  );
  const match = decoded.match(pattern);
  if (!match) return null;
  const [, host, imageId, colorToken] = match;
  return `https://${host}/image.${imageId}.${last4}/ssrco,classic_tee,flatlay,${colorToken},front,tall_portrait,x1000.jpg`;
}

function sanitizeText(value: string | undefined | null): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

// Description text may contain `\n\n` paragraph breaks that are meaningful to preserve
// (matches how existing rows store it) — only trims the ends, doesn't collapse whitespace.
function extractMetaDescription(html: string): string {
  const $ = load(html);
  return ($("meta[name='description']").attr("content") || "").trim();
}

function getRequestHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...defaultHeaders,
    ...(extra || {}),
  };
}

export function isCloudflareChallengePage(html: string): boolean {
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

export function parseShopNextData(html: string): ParsedShopPage {
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
    const hasProductPage = !!item.productPageUrl;
    const previews = item.previewSet?.previews || [];
    const preferred = previews.find((p) => p.previewTypeId === "product_close");
    const previewUrl = (preferred || previews[0])?.url || "";

    if (!Number.isFinite(externalId) || !title || !hasProductPage || !previewUrl) continue;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    const externalImageUrl = buildArtworkImageUrl(previewUrl);

    designs.push({
      externalId,
      title,
      description: "",
      keywords: (item.work?.tags || []).join(", "),
      externalLink: buildShopApUrl(externalId),
      externalImageUrl,
      category: "no_category",
      collection: "no_collection",
      imageName: null,
      backgroundColor: "#FFFFFF",
      backgroundColors: "",
      shared: false,
      // mockup_tshirt is never known at listing time — it's only extracted from the
      // /shop/ap/<workId> page (see fetchShopApPages), which is fetched once for new
      // designs and once for existing designs still missing it.
      props: null,
    });
  }

  return { designs, collections, filteredCollection, totalPages };
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
        const parsed = parseShopNextData(html);
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

export async function createPlaywrightSession(options: {
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
    // Fetches a URL via `fetch()` run inside the already-navigated page, reusing its cookies
    // (`credentials: "include"`) instead of a fresh top-level navigation — used by callers
    // that find a fresh `page.goto` re-triggers a Cloudflare challenge on every page after the
    // first, even though the same session's cookies satisfy it for a same-origin `fetch`.
    async fetchInPage(url: string): Promise<{ status: number; body: string }> {
      return page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: "include" });
        return { status: r.status, body: await r.text() };
      }, url);
    },
    // Bare navigation with none of `fetchHtml`'s challenge-detection throw — for callers that
    // need to inspect/wait on the page themselves before deciding whether it's a challenge
    // (e.g. giving a human running headful a chance to solve it) rather than failing fast.
    async openPage(url: string): Promise<void> {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    },
    // Passive wait only — never interacts with the page. Resolves true once `selector`
    // appears within `timeoutMs`, or false on timeout (e.g. a human didn't clear a challenge
    // in time).
    async waitForSelector(selector: string, timeoutMs: number): Promise<boolean> {
      return page.waitForSelector(selector, { timeout: timeoutMs }).then(
        () => true,
        () => false,
      );
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

      return parseShopNextData(body);
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

type BrowserSession = Awaited<ReturnType<typeof createPlaywrightSession>>;

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  handler: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) return;
      const result = await handler(item);
      results.push(result);
    }
  });
  await Promise.all(workers);
  return results;
}

export type ShopApPageData = { description: string; mockupUrl: string | null };

// Fetches `/shop/ap/<workId>` for a batch of work ids, through whichever fetch path the
// active mode uses, paced by `pacer`, and extracts both the work description
// (`<meta name="description">`) and the artist's Classic T-Shirt mockup color
// (`extractClassicTeeMockupUrl`). Called for every new design (description + mockup) and
// every existing design still missing `props.mockup_tshirt` (mockup only) — see
// `writeDesignsToSupabase`. A work id missing from the returned map means the fetch itself
// failed (`onError` was called for it); a work id present with `mockupUrl: null` means the
// page was fetched fine but no Classic T-Shirt preview was found for it.
async function fetchShopApPages(
  workIds: number[],
  browserSession: BrowserSession | null,
  requestHeaders: Record<string, string> | undefined,
  pacer: RequestPacer,
  concurrency: number,
  onError: (workId: number, error: unknown) => void,
): Promise<Map<number, ShopApPageData>> {
  const entries = await runWithConcurrency(
    workIds,
    concurrency,
    async (workId): Promise<[number, ShopApPageData] | null> => {
      const url = buildShopApUrl(workId);
      try {
        await pacer.waitTurn();
        const html = browserSession ? await browserSession.fetchHtml(url) : await fetchHtml(url, requestHeaders);
        return [
          workId,
          { description: extractMetaDescription(html), mockupUrl: extractClassicTeeMockupUrl(html, workId) },
        ];
      } catch (error) {
        onError(workId, error);
        return null;
      }
    },
  );
  const map = new Map<number, ShopApPageData>();
  for (const entry of entries) {
    if (entry) map.set(entry[0], entry[1]);
  }
  return map;
}

export async function fetchRedbubbleDesigns(options: RedbubbleScrapeOptions): Promise<{
  productLinks: string[];
  designs: DesignRecord[];
  collections: RedbubbleCollection[];
  collectionsComplete: boolean;
  errors: string[];
  warnings: string[];
  // Fetches `/shop/ap/<workId>` (description + Classic T-Shirt mockup color) for the given
  // work ids. Kept open here so it can reuse the same browser session/pacer as the listing
  // crawl; callers must call `close()` when done.
  fetchShopApPages: (
    workIds: number[],
    onError: (workId: number, error: unknown) => void,
  ) => Promise<Map<number, ShopApPageData>>;
  close: () => Promise<void>;
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
        const parsed = browserSession
          ? await browserSession.scrapeListingCards(pageUrl)
          : parseShopNextData(await fetchHtml(pageUrl, options.requestHeaders));

        if (page === 1) {
          shopCollections = parsed.collections;
          nextDataAvailable = true;
        }
        if (!parsed.designs.length) break;
        parsed.designs.forEach((row) => listingDesigns.set(row.externalId, row));
        if (pageDelayMs > 0) await sleep(pageDelayMs);
        if (page >= parsed.totalPages) break;
      } catch (error) {
        errors.push(String(error));
        break;
      }
    }

    const filtered = Array.from(listingDesigns.values());

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
      productLinks: filtered.map((d) => d.externalLink),
      designs: filtered,
      collections: shopCollections,
      collectionsComplete,
      errors,
      warnings,
      fetchShopApPages: (workIds, onError) =>
        fetchShopApPages(workIds, browserSession, options.requestHeaders, pacer, concurrency, onError),
      close: async () => {
        if (browserSession) await browserSession.close();
      },
    };
  } catch (error) {
    if (browserSession) await browserSession.close();
    throw error;
  }
}

type RedbubbleFetchResult = Awaited<ReturnType<typeof fetchRedbubbleDesigns>>;

// Split from `syncRedbubbleToSupabase` so callers that also need the raw scrape (e.g. the
// CLI's `--target=both`) can fetch once and reuse the result instead of scraping twice.
export async function writeDesignsToSupabase(
  fetchResult: RedbubbleFetchResult,
  options: Pick<RedbubbleSyncOptions, "supabaseUrl" | "supabaseKey" | "dryRun">,
): Promise<SyncResult> {
  const {
    productLinks,
    designs,
    collections,
    collectionsComplete,
    errors,
    warnings: fetchWarnings,
    fetchShopApPages: fetchNewShopApPages,
    close,
  } = fetchResult;
  const dryRun = options.dryRun ?? false;

  const supabase = createClient(options.supabaseUrl, options.supabaseKey);
  // `collections` (the per-design title list) is derived, UI-facing data — the `designs`
  // table only stores the flat `collection` column, so it must never be sent as a column.
  const rows = designs.map((design) => {
    const rest: DesignRecord = { ...design };
    delete rest.collections;
    return rest;
  });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let unchanged = 0;
  let errorsCount = errors.length;
  const errorMessages = [...errors];
  const warnings: string[] = [...fetchWarnings];
  if (!collectionsComplete && collections.length) {
    warnings.push(
      "Collections crawl incomplete: skipped collection sync and left existing rows' collection field unchanged.",
    );
  }

  const collectionByTitle = new Map(collections.map((c) => [c.title, c]));

  const insertRows: (typeof rows)[0][] = [];
  const updateRows: { externalId: number; collection?: string; props?: object }[] = [];
  const successfulExternalIds: number[] = [];

  try {
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

        const existingExternalIds = new Set<number>();
        const existingRowByExternalId = new Map<number, { props: { mockup_tshirt?: string } | null }>();
        for (const rowChunk of chunk(batchRows, 100)) {
          const idChunk = rowChunk.map((r) => r.externalId);
          const { data, error } = await supabase
            .from("designs")
            .select(EXISTENCE_CHECK_COLUMNS)
            .in("externalId", idChunk);
          if (error) {
            errorMessages.push(error.message);
            idChunk.forEach((id) => failedExternalIds.add(id));
            continue;
          }
          for (const row of (data as
            | { externalId: number; props: { mockup_tshirt?: string } | null }[]
            | null) || []) {
            existingExternalIds.add(row.externalId);
            existingRowByExternalId.set(row.externalId, { props: row.props });
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

        const newRows: (typeof rows)[0][] = [];
        // Existing rows that survived the id/title checks — their update is finalized after
        // the shop/ap fetch below, once we know whether a missing mockup was found.
        const existingCandidates: {
          row: (typeof rows)[0];
          existingProps: { mockup_tshirt?: string } | null;
          needsMockupBackfill: boolean;
        }[] = [];

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

          if (existingExternalIds.has(r.externalId)) {
            const existingProps = existingRowByExternalId.get(r.externalId)?.props ?? null;
            existingCandidates.push({
              row: r,
              existingProps,
              needsMockupBackfill: !existingProps?.mockup_tshirt,
            });
          } else {
            newRows.push(r);
          }
        }

        // Slugs are assigned once, on insert, and never rewritten (URLs must stay stable).
        // Group new rows by their slug base and run one `LIKE` lookup per distinct base to
        // find any slugs already taken in the database (bases only ever contain [a-z0-9-],
        // never `%`/`_`, so they're safe to interpolate into a LIKE pattern). A failed lookup
        // means we can't safely assign a slug for that base, so those rows are dropped from
        // this run and counted as errors, the same as any other per-row lookup failure.
        const slugBaseByExternalId = new Map<number, string>();
        for (const r of newRows) {
          slugBaseByExternalId.set(r.externalId, designSlugBase(r.title, r.externalId));
        }
        const distinctBases = Array.from(new Set(slugBaseByExternalId.values()));
        const takenSlugs = new Set<string>();
        const failedSlugBases = new Set<string>();
        for (const base of distinctBases) {
          const { data, error } = await supabase.from("designs").select("slug").like("slug", `${base}%`);
          if (error) {
            errorMessages.push(error.message);
            failedSlugBases.add(base);
            continue;
          }
          for (const row of (data as { slug: string | null }[] | null) || []) {
            if (row.slug) takenSlugs.add(row.slug);
          }
        }
        if (failedSlugBases.size) {
          const survivingNewRows: (typeof rows)[0][] = [];
          for (const r of newRows) {
            const base = slugBaseByExternalId.get(r.externalId)!;
            if (failedSlugBases.has(base)) {
              errorsCount += 1;
            } else {
              survivingNewRows.push(r);
            }
          }
          newRows.length = 0;
          newRows.push(...survivingNewRows);
        }
        const slugByExternalId = new Map<number, string>();
        for (const r of newRows) {
          const base = slugBaseByExternalId.get(r.externalId)!;
          const slug = uniqueSlug(base, takenSlugs);
          takenSlugs.add(slug);
          slugByExternalId.set(r.externalId, slug);
        }

        // One /shop/ap/<workId> fetch per new design (description + mockup color) and per
        // existing design still missing props.mockup_tshirt (mockup color only) — a design
        // that already has a mockup is never fetched.
        const backfillCandidates = existingCandidates.filter((c) => c.needsMockupBackfill);
        const shopApWorkIds = [
          ...newRows.map((r) => r.externalId),
          ...backfillCandidates.map((c) => c.row.externalId),
        ];
        let shopApFetchErrors = 0;
        const shopApData = shopApWorkIds.length
          ? await fetchNewShopApPages(shopApWorkIds, (workId, error) => {
              shopApFetchErrors++;
              errorMessages.push(`Failed to fetch /shop/ap/${workId}: ${error}`);
            })
          : new Map<number, ShopApPageData>();
        errorsCount += shopApFetchErrors;

        const nowIso = new Date().toISOString();
        for (const r of newRows) {
          const data = shopApData.get(r.externalId);
          let props: { mockup_tshirt: string } | null = null;
          let externalImageUrl = r.externalImageUrl;
          let backgroundColor = r.backgroundColor;
          if (data) {
            if (data.mockupUrl) {
              props = { mockup_tshirt: data.mockupUrl };
              // New designs get the artist's own mockup color baked into the artwork image
              // right away, instead of shipping with the "white fills transparency" default.
              // Built from the mockup URL's own image id, not the listing preview's — Redbubble
              // stores several uploads per work, and the listing preview is sometimes a
              // different, wrong-aspect upload (e.g. a tiled banner) rather than the tee artwork
              // that the mockup URL always points at.
              const token = extractMockupToken(data.mockupUrl);
              if (token) {
                externalImageUrl = buildBackgroundImageUrl(data.mockupUrl, token);
                backgroundColor = tokenToHex(token);
              }
            } else {
              warnings.push(`No Classic T-Shirt preview for ${r.externalId}; mockup_tshirt not set`);
            }
          }
          insertRows.push({
            ...r,
            externalImageUrl,
            backgroundColor,
            description: data?.description ?? "",
            props,
            slug: slugByExternalId.get(r.externalId),
            updatedAt: nowIso,
          });
        }

        for (const c of existingCandidates) {
          let propsUpdate: { mockup_tshirt: string } | undefined;
          if (c.needsMockupBackfill) {
            const data = shopApData.get(c.row.externalId);
            if (data) {
              if (data.mockupUrl) {
                propsUpdate = { ...(c.existingProps || {}), mockup_tshirt: data.mockupUrl };
              } else {
                warnings.push(`No Classic T-Shirt preview for ${c.row.externalId}; mockup_tshirt not set`);
              }
            }
          }

          // Redbubble is the source of truth for `collection` once the collections crawl
          // succeeded; otherwise the existing row's collection is left untouched, but a
          // missing mockup_tshirt is still backfilled independently.
          if (!collectionsComplete) {
            if (propsUpdate) {
              updateRows.push({ externalId: c.row.externalId, props: propsUpdate });
            } else {
              unchanged++;
            }
            continue;
          }
          updateRows.push({
            externalId: c.row.externalId,
            collection: c.row.collection,
            ...(propsUpdate ? { props: propsUpdate } : {}),
          });
        }

        if (unchanged > 0) {
          warnings.push(`${unchanged} existing row(s) left unchanged: collections crawl incomplete`);
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
      const plannedExternalIds = new Set([
        ...insertRows.map((r) => r.externalId),
        ...updateRows.map((r) => r.externalId),
      ]);
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

    const nowIso = new Date().toISOString();

    for (const insertChunk of chunk(insertRows, 100)) {
      const { data, error } = await supabase.from("designs").insert(insertChunk).select("id");
      if (error) {
        errorsCount += insertChunk.length;
        errorMessages.push(error.message);
      } else {
        inserted += data?.length || 0;
        insertChunk.forEach((r) => successfulExternalIds.push(r.externalId));
      }
    }

    // Per-row `.update()` (only `collection`/`updatedAt`) rather than a batch upsert: a
    // batch upsert with only these columns would violate NOT NULL constraints on the other
    // columns when Postgres builds the (never-taken) insert branch of ON CONFLICT DO UPDATE.
    for (const r of updateRows) {
      const changes: { collection?: string; props?: object; updatedAt: string } = { updatedAt: nowIso };
      if (r.collection !== undefined) changes.collection = r.collection;
      if (r.props !== undefined) changes.props = r.props;
      const { error } = await supabase.from("designs").update(changes).eq("externalId", r.externalId);
      if (error) {
        errorsCount += 1;
        errorMessages.push(error.message);
      } else {
        updated += 1;
        successfulExternalIds.push(r.externalId);
      }
    }

    let collectionsUpserted = 0;
    let linksWritten = 0;

    if (collectionsComplete && collections.length) {
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
  } finally {
    await close();
  }
}

export async function syncRedbubbleToSupabase(options: RedbubbleSyncOptions): Promise<SyncResult> {
  const fetchResult = await fetchRedbubbleDesigns(options);
  return writeDesignsToSupabase(fetchResult, options);
}
