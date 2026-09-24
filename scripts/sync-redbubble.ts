import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { closeDatabaseConnections, loadSiteConfig } from "../utils/database";
import {
  fetchRedbubbleDesigns,
  writeDesignsToSupabase,
  type RedbubbleCollection,
  type SyncResult,
} from "../lib/sync/redbubble";

export type SyncTarget = "db" | "json" | "both";

function parseTarget(): SyncTarget {
  const flag = process.argv.find((arg) => arg.startsWith("--target="));
  const raw = (flag ? flag.slice("--target=".length) : process.env.SYNC_TARGET || "db").trim();
  if (raw === "db" || raw === "json" || raw === "both") return raw;
  throw new Error(`Invalid --target "${raw}": expected db, json, or both`);
}

function parseOutPath(): string {
  const flag = process.argv.find((arg) => arg.startsWith("--out="));
  return (flag ? flag.slice("--out=".length) : process.env.SYNC_OUT || ".cache/redbubble-sync.json").trim();
}

// Pure precedence rule, exported for cheap unit testing: for `json` target, an already-set
// REDBUBBLE_SHOP_URL wins outright (site config must not even be queried, see resolveShopUrl
// below); for `db`/`both` the DB-backed config always wins over the env fallback.
export function pickShopUrl(target: SyncTarget, envShopUrl: string, configShopUrl: string): string {
  if (target === "json" && envShopUrl) {
    return envShopUrl;
  }
  return configShopUrl || envShopUrl || "";
}

async function resolveShopUrl(target: SyncTarget): Promise<string> {
  const envShopUrl = process.env.REDBUBBLE_SHOP_URL || "";

  // `json` target must never touch the DB-backed config when the env var already resolves
  // the shop URL — it's meant to run with no DB credentials at all.
  if (target === "json" && envShopUrl) {
    return envShopUrl;
  }

  try {
    const config = await loadSiteConfig();
    const configShopUrl = config.representation?.redbubbleShopUrl || config.representation?.redbuble || "";
    return pickShopUrl(target, envShopUrl, configShopUrl);
  } catch (error) {
    if (envShopUrl) return envShopUrl;
    throw new Error(
      `Could not read site config to resolve the shop URL and REDBUBBLE_SHOP_URL is unset: ${error}`,
    );
  }
}

function buildScrapeOptions(shopUrl: string) {
  const maxPages = process.env.SYNC_MAX_PAGES ? Number(process.env.SYNC_MAX_PAGES) : 5;
  const pageDelayMs = process.env.SYNC_PAGE_DELAY_MS ? Number(process.env.SYNC_PAGE_DELAY_MS) : 3000;
  const minRequestIntervalMs = process.env.SYNC_MIN_REQUEST_INTERVAL_MS
    ? Number(process.env.SYNC_MIN_REQUEST_INTERVAL_MS)
    : 2500;
  const jitterMs = process.env.SYNC_REQUEST_JITTER_MS ? Number(process.env.SYNC_REQUEST_JITTER_MS) : 700;
  const concurrency = process.env.SYNC_CONCURRENCY ? Number(process.env.SYNC_CONCURRENCY) : 1;
  const usePlaywright = process.env.SYNC_USE_PLAYWRIGHT ? process.env.SYNC_USE_PLAYWRIGHT === "true" : true;
  const playwrightHeadless = process.env.SYNC_PLAYWRIGHT_HEADLESS
    ? process.env.SYNC_PLAYWRIGHT_HEADLESS === "true"
    : true;
  const playwrightStorageStatePath = process.env.SYNC_PLAYWRIGHT_STORAGE_STATE_PATH || undefined;
  const requestHeaders: Record<string, string> = {};
  if (process.env.REDBUBBLE_USER_AGENT) {
    requestHeaders["user-agent"] = process.env.REDBUBBLE_USER_AGENT;
  }
  if (process.env.REDBUBBLE_COOKIE) {
    requestHeaders.cookie = process.env.REDBUBBLE_COOKIE;
  }

  return {
    shopUrl,
    maxPages,
    pageDelayMs,
    minRequestIntervalMs,
    jitterMs,
    concurrency,
    requestHeaders,
    usePlaywright,
    playwrightHeadless,
    playwrightStorageStatePath,
  };
}

// Pure so it can be unit tested without touching Supabase — the `json` target must never
// create a Supabase client.
export function buildJsonPayload(opts: {
  shopUrl: string;
  usePlaywright: boolean;
  target: SyncTarget;
  collections: RedbubbleCollection[];
  designs: Array<{ externalId: number; collections?: string[] }>;
  result?: SyncResult;
  errors: string[];
}) {
  const membershipByExternalId = new Map<number, number[]>();
  const collectionExternalIdByTitle = new Map(opts.collections.map((c) => [c.title, c.externalId]));
  for (const design of opts.designs) {
    for (const title of design.collections || []) {
      const collectionExternalId = collectionExternalIdByTitle.get(title);
      if (collectionExternalId === undefined) continue;
      const list = membershipByExternalId.get(collectionExternalId);
      if (list) list.push(design.externalId);
      else membershipByExternalId.set(collectionExternalId, [design.externalId]);
    }
  }

  return {
    meta: {
      shopUrl: opts.shopUrl,
      fetchedAt: new Date().toISOString(),
      mode: opts.usePlaywright ? ("playwright" as const) : ("cheerio" as const),
      target: opts.target,
    },
    collections: opts.collections.map((c) => ({
      externalId: c.externalId,
      title: c.title,
      description: c.description,
      coverImageUrl: c.coverImageUrl,
      workIds: membershipByExternalId.get(c.externalId) || [],
    })),
    designs: opts.designs,
    ...(opts.result ? { result: opts.result } : {}),
    errors: opts.errors,
  };
}

function writeJsonFile(outPath: string, payload: unknown) {
  const parent = path.dirname(outPath);
  if (parent && !fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  const target = parseTarget();
  const outPath = parseOutPath();

  const shopUrl = await resolveShopUrl(target);
  if (!shopUrl) {
    throw new Error("Missing Redbubble shop URL");
  }

  if (target === "json") {
    const scrapeOptions = buildScrapeOptions(shopUrl);
    // No DB access in this target, so designs' descriptions are never fetched (stay "") —
    // `close()` still needs to run to shut down the Playwright session if one was opened.
    const { designs, collections, errors, close } = await fetchRedbubbleDesigns(scrapeOptions);
    await close();
    const payload = buildJsonPayload({
      shopUrl,
      usePlaywright: scrapeOptions.usePlaywright,
      target,
      collections,
      designs,
      errors,
    });
    writeJsonFile(outPath, payload);
    console.log(JSON.stringify({ target, outPath, designs: designs.length, collections: collections.length, errors: errors.length }, null, 2));
    if (errors.length > 0) process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseKey) {
    if (!dryRun) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is required for writes (RLS allows anon read-only). Use --dry-run to preview.",
      );
    }
    supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  }

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const scrapeOptions = buildScrapeOptions(shopUrl);
  const fetchResult = await fetchRedbubbleDesigns(scrapeOptions);
  const result = await writeDesignsToSupabase(fetchResult, { supabaseUrl, supabaseKey, dryRun });

  console.log(JSON.stringify(result, null, 2));

  if (target === "both") {
    const payload = buildJsonPayload({
      shopUrl,
      usePlaywright: scrapeOptions.usePlaywright,
      target,
      collections: fetchResult.collections,
      designs: fetchResult.designs,
      result,
      errors: fetchResult.errors,
    });
    writeJsonFile(outPath, payload);
  }

  if (result.errors > 0) process.exitCode = 1;
}

async function main() {
  try {
    await run();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    // No explicit process.exit() here: on Windows it can race Playwright's browser-close
    // handles (libuv UV_HANDLE_CLOSING assertion), crashing the process instead of exiting
    // cleanly. fetchRedbubbleDesigns already closes the Playwright session in its own
    // `finally`, so once this promise settles nothing keeps the event loop alive — Node
    // exits naturally with whatever `process.exitCode` was set to.
    await closeDatabaseConnections();
  }
}

main();
