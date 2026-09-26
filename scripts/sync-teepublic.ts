import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { closeDatabaseConnections, loadSiteConfig } from "../utils/database";
import {
  normalizeTeepublicStoreUrl,
  fetchTeepublicDesigns,
  fetchTeepublicFeedDesigns,
  loadDesignRows,
  matchTeepublicDesigns,
  splitMatches,
  applyTeepublicLinks,
} from "../lib/sync/teepublic";

type SyncTarget = "db" | "json";
type SyncSource = "feed" | "browser";

function parseSource(): SyncSource {
  const flag = process.argv.find((arg) => arg.startsWith("--source="));
  const raw = (flag ? flag.slice("--source=".length) : process.env.TEEPUBLIC_SOURCE || "feed").trim();
  if (raw === "feed" || raw === "browser") return raw;
  throw new Error(`Invalid --source "${raw}": expected feed or browser`);
}

function parseTarget(): SyncTarget {
  const flag = process.argv.find((arg) => arg.startsWith("--target="));
  const raw = (flag ? flag.slice("--target=".length) : "db").trim();
  if (raw === "db" || raw === "json") return raw;
  throw new Error(`Invalid --target "${raw}": expected db or json`);
}

function parseOutPath(): string {
  const flag = process.argv.find((arg) => arg.startsWith("--out="));
  return (flag ? flag.slice("--out=".length) : ".cache/teepublic-sync.json").trim();
}

function parseThreshold(): number | undefined {
  const flag = process.argv.find((arg) => arg.startsWith("--threshold="));
  if (!flag) return undefined;
  const value = Number(flag.slice("--threshold=".length));
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid --threshold "${flag}": expected a number between 0 and 1`);
  }
  return value;
}

async function resolveStoreUrl(): Promise<string> {
  const envStoreUrl = process.env.TEEPUBLIC_STORE_URL || "";
  if (envStoreUrl) {
    return normalizeTeepublicStoreUrl(envStoreUrl);
  }

  const config = await loadSiteConfig();
  const configStoreUrl = config.representation?.teepublic || "";
  if (!configStoreUrl) {
    throw new Error("Missing TeePublic store URL: set TEEPUBLIC_STORE_URL or representation.teepublic");
  }
  return normalizeTeepublicStoreUrl(configStoreUrl);
}

function buildCommonOptions(storeUrl: string) {
  const maxPages = process.env.TEEPUBLIC_MAX_PAGES ? Number(process.env.TEEPUBLIC_MAX_PAGES) : 20;
  const minRequestIntervalMs = process.env.SYNC_MIN_REQUEST_INTERVAL_MS
    ? Number(process.env.SYNC_MIN_REQUEST_INTERVAL_MS)
    : 2500;
  const jitterMs = process.env.SYNC_REQUEST_JITTER_MS ? Number(process.env.SYNC_REQUEST_JITTER_MS) : 700;
  return { storeUrl, maxPages, minRequestIntervalMs, jitterMs };
}

function buildBrowserScrapeOptions(storeUrl: string) {
  const playwrightHeadless = process.env.SYNC_PLAYWRIGHT_HEADLESS
    ? process.env.SYNC_PLAYWRIGHT_HEADLESS === "true"
    : true;
  const playwrightStorageStatePath =
    process.env.TEEPUBLIC_PLAYWRIGHT_STORAGE_STATE_PATH || ".cache/teepublic-storage-state.json";
  const userAgent = process.env.TEEPUBLIC_USER_AGENT || undefined;

  return {
    ...buildCommonOptions(storeUrl),
    playwrightHeadless,
    playwrightStorageStatePath,
    userAgent,
  };
}

function buildFeedScrapeOptions(storeUrl: string) {
  const userAgent = process.env.TEEPUBLIC_FEED_USER_AGENT || undefined;
  return { ...buildCommonOptions(storeUrl), userAgent };
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
  const source = parseSource();
  const outPath = parseOutPath();
  const threshold = parseThreshold();

  const storeUrl = await resolveStoreUrl();
  const { designs, errors, close } =
    source === "feed"
      ? { ...(await fetchTeepublicFeedDesigns(buildFeedScrapeOptions(storeUrl))), close: async () => {} }
      : await fetchTeepublicDesigns(buildBrowserScrapeOptions(storeUrl));

  try {
    if (target === "json") {
      const payload = {
        meta: { storeUrl, fetchedAt: new Date().toISOString(), source },
        designs,
        errors,
      };
      writeJsonFile(outPath, payload);
      console.log(
        JSON.stringify({ target, source, outPath, designs: designs.length, errors: errors.length }, null, 2),
      );
      if (errors.length > 0) process.exitCode = 1;
      return;
    }

    const databaseProvider = (process.env.DATABASE_PROVIDER || "").toLowerCase();
    if (databaseProvider === "mysql") {
      throw new Error(
        "TeePublic sync currently supports Supabase provider only. Please configure DATABASE_PROVIDER=supabase.",
      );
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

    const supabase = createClient(supabaseUrl, supabaseKey);
    const rows = await loadDesignRows(supabase);
    const { matched, ambiguous, unmatched } = matchTeepublicDesigns(designs, rows, { threshold });
    // Fuzzy matches are confidence-scored guesses, not certainties (e.g. "Retro New York City
    // Sunset" vs "Retro New York State Sunset" can score above threshold) — only exact title
    // matches are ever written to the DB; fuzzy matches are reported for manual review only.
    const { exact, fuzzy } = splitMatches(matched);
    const applied = await applyTeepublicLinks(exact, { supabaseUrl, supabaseKey, dryRun });

    const report = {
      dryRun,
      source,
      scraped: designs.length,
      matched: exact.length,
      updated: applied.updated,
      unchanged: applied.unchanged,
      ambiguous: ambiguous.map((a) => ({
        teepublicTitle: a.teepublic.title,
        url: a.teepublic.url,
        candidates: a.candidates,
      })),
      unmatched: unmatched.map((d) => ({ title: d.title, url: d.url })),
      matches: exact.map((m) => ({
        externalId: m.row.externalId,
        dbTitle: m.row.title,
        teepublicTitle: m.teepublic.title,
        score: m.score,
        method: m.method,
      })),
      fuzzy: fuzzy.map((m) => ({
        externalId: m.row.externalId,
        dbTitle: m.row.title,
        teepublicTitle: m.teepublic.title,
        url: m.teepublic.url,
        score: m.score,
      })),
      errors: [...errors, ...applied.errors],
    };

    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length > 0) process.exitCode = 1;
  } finally {
    await close();
  }
}

async function main() {
  try {
    await run();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    // No explicit process.exit(): on Windows it can race Playwright's browser-close handles
    // (see scripts/sync-redbubble.ts) — Node exits naturally once nothing keeps it alive.
    await closeDatabaseConnections();
  }
}

main();
