import { NextResponse } from "next/server";
import { getSiteConfig } from "@/utils/database";
import { syncRedbubbleToSupabase } from "@/lib/sync/redbubble";
import { authorizeSyncRequest } from "@/lib/sync-auth";

let isSyncInProgress = false;

export async function POST(request: Request) {
  if (isSyncInProgress) {
    return NextResponse.json(
      { error: "Sync operation is already in progress. Please retry later." },
      { status: 409 },
    );
  }

  const denied = authorizeSyncRequest(request);
  if (denied) return denied;

  const databaseProvider = (process.env.DATABASE_PROVIDER || "").toLowerCase();
  if (databaseProvider === "mysql") {
    return NextResponse.json(
      {
        error:
          "Redbubble sync currently supports Supabase provider only. Please configure DATABASE_PROVIDER=supabase.",
      },
      { status: 400 },
    );
  }

  isSyncInProgress = true;
  try {
    const config = await getSiteConfig();
    const shopUrl =
      config.representation?.redbubbleShopUrl ||
      config.representation?.redbuble ||
      process.env.REDBUBBLE_SHOP_URL ||
      "";

    if (!shopUrl) {
      return NextResponse.json(
        { error: "Missing Redbubble shop URL" },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!supabaseKey) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
        { status: 500 },
      );
    }

    if (!supabaseUrl) {
      return NextResponse.json(
        { error: "Missing Supabase environment variables" },
        { status: 500 },
      );
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

    return NextResponse.json(result);
  } finally {
    isSyncInProgress = false;
  }
}
