import "dotenv/config";
import { getSiteConfig } from "../utils/database";
import { syncRedbubbleToSupabase } from "../lib/sync/redbubble";

async function run() {
  const config = await getSiteConfig();
  const shopUrl =
    config.representation?.redbubbleShopUrl ||
    config.representation?.redbuble ||
    process.env.REDBUBBLE_SHOP_URL ||
    "";

  if (!shopUrl) {
    throw new Error("Missing Redbubble shop URL");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const maxPages = process.env.SYNC_MAX_PAGES
    ? Number(process.env.SYNC_MAX_PAGES)
    : 5;
  const pageDelayMs = process.env.SYNC_PAGE_DELAY_MS
    ? Number(process.env.SYNC_PAGE_DELAY_MS)
    : 3000;
  const minRequestIntervalMs = process.env.SYNC_MIN_REQUEST_INTERVAL_MS
    ? Number(process.env.SYNC_MIN_REQUEST_INTERVAL_MS)
    : 2500;
  const jitterMs = process.env.SYNC_REQUEST_JITTER_MS
    ? Number(process.env.SYNC_REQUEST_JITTER_MS)
    : 700;
  const concurrency = process.env.SYNC_CONCURRENCY
    ? Number(process.env.SYNC_CONCURRENCY)
    : 1;
  const usePlaywright = process.env.SYNC_USE_PLAYWRIGHT
    ? process.env.SYNC_USE_PLAYWRIGHT === "true"
    : true;
  const playwrightHeadless = process.env.SYNC_PLAYWRIGHT_HEADLESS
    ? process.env.SYNC_PLAYWRIGHT_HEADLESS === "true"
    : true;
  const playwrightStorageStatePath =
    process.env.SYNC_PLAYWRIGHT_STORAGE_STATE_PATH || undefined;
  const requestHeaders: Record<string, string> = {};
  if (process.env.REDBUBBLE_USER_AGENT) {
    requestHeaders["user-agent"] = process.env.REDBUBBLE_USER_AGENT;
  }
  if (process.env.REDBUBBLE_COOKIE) {
    requestHeaders.cookie = process.env.REDBUBBLE_COOKIE;
  }

  const result = await syncRedbubbleToSupabase({
    shopUrl,
    supabaseUrl,
    supabaseKey,
    maxPages,
    pageDelayMs,
    minRequestIntervalMs,
    jitterMs,
    concurrency,
    requestHeaders,
    usePlaywright,
    playwrightHeadless,
    playwrightStorageStatePath,
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
