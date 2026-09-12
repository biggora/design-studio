import { load } from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

export type RedbubbleSyncOptions = {
  shopUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
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

type DesignRecord = {
  externalId: number;
  title: string;
  description: string;
  keywords: string;
  externalLink: string;
  externalImageUrl: string;
  category: string;
  collection: string;
  imageName: string;
  backgroundColor: string;
  backgroundColors: string;
  shared: boolean;
  props: object;
  createdAt?: string;
  updatedAt?: string;
};

export type SyncResult = {
  fetchedProductLinks: number;
  parsedProducts: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
};

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

function absoluteUrl(baseUrl: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return maybeRelative;
  }
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
    async scrapeListingCards(pageUrl: string): Promise<DesignRecord[]> {
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

      for (let i = 0; i < 8; i += 1) {
        const previous = await page.evaluate(() => document.body.scrollHeight);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1200);
        const current = await page.evaluate(() => document.body.scrollHeight);
        if (current === previous) break;
      }

      const cards = await page.evaluate(() => {
        const out: Array<{
          externalId: number | null;
          title: string;
          externalLink: string;
          externalImageUrl: string;
        }> = [];

        const nodes = Array.from(document.querySelectorAll(".xblock, [data-testid='search-result-card']"));
        for (const node of nodes) {
          const linkEl = node.querySelector("a[href]");
          const imgEl = node.querySelector("img");
          const titleEl = node.querySelector("span[data-testid='ds-box'], img[alt], h2, h3");
          if (!linkEl || !imgEl) continue;

          const href = linkEl.getAttribute("href") || "";
          const image = imgEl.getAttribute("src") || "";
          const title =
            (titleEl?.textContent || imgEl.getAttribute("alt") || "").trim();
          const linkId = linkEl.getAttribute("id");
          const idNum = linkId ? Number(linkId) : null;

          out.push({
            externalId: Number.isFinite(idNum) ? idNum : null,
            title,
            externalLink: href,
            externalImageUrl: image,
          });
        }
        return out;
      });

      const normalized = cards
        .map((item): DesignRecord | null => {
          const link = absoluteUrl(pageUrl, item.externalLink);
          const image = absoluteUrl(pageUrl, item.externalImageUrl);
          const externalId = item.externalId || extractExternalIdFromUrl(link) || 0;
          if (!externalId || !item.title || !link || !image) return null;
          return {
            externalId,
            title: item.title,
            description: "",
            keywords: "",
            externalLink: link,
            externalImageUrl: image,
            category: extractCategoryFromUrl(link),
            collection: "no_collection",
            imageName: getImageName(image),
            backgroundColor: "#FFFFFF",
            backgroundColors: "",
            shared: true,
            props: { source: "redbubble", rawUrl: pageUrl },
          };
        })
        .filter((x): x is DesignRecord => !!x);

      return normalized;
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
  const html = await fetchHtml(pageUrl, requestHeaders);
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

export async function fetchRedbubbleDesigns(options: RedbubbleSyncOptions): Promise<{
  productLinks: string[];
  designs: DesignRecord[];
  errors: string[];
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
  const listingDesigns = new Map<number, DesignRecord>();

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const pageUrl = buildShopPageUrl(shopUrl, page);
      try {
        await pacer.waitTurn();
        if (browserSession) {
          const rows = await browserSession.scrapeListingCards(pageUrl);
          if (!rows.length) break;
          rows.forEach((row) => listingDesigns.set(row.externalId, row));
        } else {
          const links = await getProductLinksFromShopPage(pageUrl, options.requestHeaders);
          if (!links.length) break;
          links.forEach((link) => allProductLinks.add(link));
        }
        if (pageDelayMs > 0) await sleep(pageDelayMs);
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
    return {
      productLinks: browserSession ? filtered.map((d) => d.externalLink) : productLinks,
      designs: filtered,
      errors,
    };
  } finally {
    if (browserSession) {
      await browserSession.close();
    }
  }
}

export async function syncRedbubbleToSupabase(options: RedbubbleSyncOptions): Promise<SyncResult> {
  const { productLinks, designs, errors } = await fetchRedbubbleDesigns(options);

  const supabase = createClient(options.supabaseUrl, options.supabaseKey);
  const rows = designs.map((design) => ({
    ...design,
    updatedAt: new Date().toISOString(),
  }));

  const inserted = 0;
  let updated = 0;
  const skipped = 0;
  let errorsCount = errors.length;
  const errorMessages = [...errors];

  if (!rows.length) {
    return {
      fetchedProductLinks: productLinks.length,
      parsedProducts: designs.length,
      inserted,
      updated,
      skipped: productLinks.length,
      errors: errorsCount,
      errorMessages,
    };
  }

  const uniqueMap = new Map<number, (typeof rows)[0]>();
  for (const r of rows) {
    uniqueMap.set(r.externalId, r);
  }
  const dedupedRows = Array.from(uniqueMap.values());

  const { data, error } = await supabase
    .from("designs")
    .upsert(dedupedRows, { onConflict: "externalId", ignoreDuplicates: false })
    .select("id, externalId");

  if (error) {
    errorsCount += dedupedRows.length;
    errorMessages.push(error.message);
  } else {
    updated += data?.length || 0;
  }

  return {
    fetchedProductLinks: productLinks.length,
    parsedProducts: designs.length,
    inserted,
    updated,
    skipped,
    errors: errorsCount,
    errorMessages,
  };
}
