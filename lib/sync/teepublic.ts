import { load } from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { RequestPacer, createPlaywrightSession, isCloudflareChallengePage } from "@/lib/sync/redbubble";

const execFileAsync = promisify(execFile);

export type TeepublicDesign = {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
};

const TEEPUBLIC_HOSTS = new Set(["www.teepublic.com", "teepublic.com"]);

// Accepts a store URL/handle in either of TeePublic's two path shapes and always normalizes
// to the `/user/<name>` form (both resolve to the same store).
export function normalizeTeepublicStoreUrl(input: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    throw new Error("Missing TeePublic store URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error(`Invalid TeePublic store URL: ${input}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`TeePublic store URL must use https: ${input}`);
  }
  if (!TEEPUBLIC_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`TeePublic store URL must be on teepublic.com: ${input}`);
  }

  const match = parsed.pathname.match(/^\/(user|stores)\/([^/]+)\/?$/);
  if (!match) {
    throw new Error(`TeePublic store URL must be a /user/<name> or /stores/<name> path: ${input}`);
  }

  return `https://www.teepublic.com/user/${match[2]}`;
}

// Resolves a design tile's href (relative or absolute) to the canonical design-page URL
// (query/hash stripped), or null when it isn't a recognizable TeePublic design URL.
export function canonicalTeepublicDesignUrl(href: string): string | null {
  if (!href) return null;
  let parsed: URL;
  try {
    parsed = new URL(href, "https://www.teepublic.com");
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (!TEEPUBLIC_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  if (!/^\/[^/]+\/[0-9]+-[^/?#]+$/.test(parsed.pathname)) return null;
  return `https://www.teepublic.com${parsed.pathname}`;
}

// Parses a TeePublic store listing page (one of `?page=N`) into its design tiles.
export function parseTeepublicStorePage(html: string): TeepublicDesign[] {
  const $ = load(html);
  const seen = new Set<string>();
  const designs: TeepublicDesign[] = [];

  $("div.tp-design-tile.jsDesignContainer").each((_, el) => {
    const $tile = $(el);
    const id = ($tile.attr("data-design-id") || "").trim();
    const title = ($tile.attr("data-gtm-design-title") || "").trim();
    const rawHref =
      $tile.attr("data-url") || $tile.find("a.tp-design-image__preview_link").attr("href") || "";
    const url = canonicalTeepublicDesignUrl(rawHref);
    const imageUrl = $tile.find("img.tp-design-tile__image").attr("src") || null;

    if (!id || !title || !url) return;
    if (seen.has(id)) return;
    seen.add(id);

    designs.push({ id, title, url, imageUrl });
  });

  return designs;
}

// Lowercases, expands `&` to "and", strips everything but letters/digits (unicode-aware) to
// spaces, and collapses whitespace — used both for exact-match grouping and as the token
// source for titleSimilarity.
export function normalizeTitle(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Dice coefficient over the sets of unique normalized tokens in each title. 0..1; both
// titles normalizing to no tokens returns 0 (no similarity signal available).
export function titleSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const setB = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 0;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

export type DbDesignRow = {
  externalId: number;
  title: string;
  props: Record<string, unknown> | null;
};

export type TeepublicMatch = {
  row: DbDesignRow;
  teepublic: TeepublicDesign;
  score: number;
  method: "exact" | "fuzzy";
};

export type TeepublicAmbiguity = {
  teepublic: TeepublicDesign;
  candidates: Array<{ externalId: number; title: string; score: number }>;
};

export type TeepublicMatchResult = {
  matched: TeepublicMatch[];
  ambiguous: TeepublicAmbiguity[];
  unmatched: TeepublicDesign[];
};

// Matches TeePublic designs to existing DB rows by title, 1:1. Pass 1 requires an exact
// normalized-title equality with exactly one unclaimed candidate row; more than one candidate
// (e.g. two DB rows sharing a title) is ambiguous rather than guessed. Pass 2 scores every
// TeePublic design still unmatched against every still-unclaimed row with `titleSimilarity`
// and accepts the best candidate only when it clears both `threshold` and a `margin` over the
// second-best (otherwise ambiguous, or unmatched if nothing clears `threshold`). Fuzzy designs
// are processed in descending best-score order so earlier, more-confident matches claim rows
// before later, weaker ones contend for them.
export function matchTeepublicDesigns(
  tp: TeepublicDesign[],
  rows: DbDesignRow[],
  opts?: { threshold?: number; margin?: number },
): TeepublicMatchResult {
  const threshold = opts?.threshold ?? 0.8;
  const margin = opts?.margin ?? 0.1;

  const claimed = new Set<number>();
  const matched: TeepublicMatch[] = [];
  const ambiguous: TeepublicAmbiguity[] = [];

  const rowsByNormTitle = new Map<string, DbDesignRow[]>();
  for (const row of rows) {
    const norm = normalizeTitle(row.title);
    const list = rowsByNormTitle.get(norm);
    if (list) list.push(row);
    else rowsByNormTitle.set(norm, [row]);
  }

  const remaining: TeepublicDesign[] = [];
  for (const t of tp) {
    const norm = normalizeTitle(t.title);
    const candidates = (rowsByNormTitle.get(norm) || []).filter((r) => !claimed.has(r.externalId));
    if (candidates.length === 1) {
      claimed.add(candidates[0].externalId);
      matched.push({ row: candidates[0], teepublic: t, score: 1, method: "exact" });
    } else if (candidates.length > 1) {
      ambiguous.push({
        teepublic: t,
        candidates: candidates.map((r) => ({ externalId: r.externalId, title: r.title, score: 1 })),
      });
    } else {
      remaining.push(t);
    }
  }

  // Fixed, deterministic processing order for pass 2: descending initial best-score.
  const initialBestScore = new Map<string, number>();
  for (const t of remaining) {
    let best = -1;
    for (const r of rows) {
      if (claimed.has(r.externalId)) continue;
      const score = titleSimilarity(t.title, r.title);
      if (score > best) best = score;
    }
    initialBestScore.set(t.id, best);
  }
  const order = [...remaining].sort(
    (a, b) => (initialBestScore.get(b.id) ?? -1) - (initialBestScore.get(a.id) ?? -1),
  );

  const unmatched: TeepublicDesign[] = [];
  for (const t of order) {
    const scored = rows
      .filter((r) => !claimed.has(r.externalId))
      .map((r) => ({ row: r, score: titleSimilarity(t.title, r.title) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score < threshold) {
      unmatched.push(t);
      continue;
    }

    const second = scored[1];
    const marginOk = !second || best.score - second.score >= margin;
    if (!marginOk) {
      const closeCandidates = scored.filter((c) => best.score - c.score < margin);
      ambiguous.push({
        teepublic: t,
        candidates: closeCandidates.map((c) => ({
          externalId: c.row.externalId,
          title: c.row.title,
          score: c.score,
        })),
      });
      continue;
    }

    claimed.add(best.row.externalId);
    matched.push({ row: best.row, teepublic: t, score: best.score, method: "fuzzy" });
  }

  return { matched, ambiguous, unmatched };
}

// Fuzzy matches are confidence-scored guesses (e.g. "Retro New York City Sunset" vs "Retro New
// York State Sunset" can score above threshold) and must never be written to the DB — only
// exact title matches are safe to auto-apply. Callers that write links should split on this
// and only pass `.exact` to `applyTeepublicLinks`, surfacing `.fuzzy` for manual review instead.
export function splitMatches(matched: TeepublicMatch[]): { exact: TeepublicMatch[]; fuzzy: TeepublicMatch[] } {
  return {
    exact: matched.filter((m) => m.method === "exact"),
    fuzzy: matched.filter((m) => m.method === "fuzzy"),
  };
}

// `ReturnType<typeof createClient>` (no invocation context) resolves the generic defaults'
// *constraints* rather than their declared defaults, producing a type incompatible with an
// actual `createClient(url, key)` call site — pin `Database` explicitly instead.
type SupabaseClient = ReturnType<typeof createClient<Record<string, unknown>>>;

// A current desktop Chrome UA — headless Chromium's default UA advertises "HeadlessChrome",
// which Cloudflare flags outright. Overridable via TEEPUBLIC_USER_AGENT (see scripts/sync-teepublic.ts).
const DEFAULT_DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TEEPUBLIC_CHALLENGE_ERROR =
  "TeePublic blocked automated access with a Cloudflare challenge. Run once with " +
  "SYNC_PLAYWRIGHT_HEADLESS=false and complete the challenge, then reuse the same storage state path.";

const DEFAULT_HUMAN_WAIT_MS = 180000;

// An honest, self-identifying UA for the no-browser feed source — Cloudflare allows it (unlike
// a bare Node `fetch`, which is blocked by TLS fingerprinting regardless of UA string).
export const TEEPUBLIC_FEED_USER_AGENT = "design-studio-sync/1.0 (+teepublic link sync)";

// Fetches TeePublic's public `/feed?page=N` listing (same design tiles as the store page, no
// browser involved) via the system `curl` binary — Node's built-in `fetch` gets a Cloudflare
// 403 for any User-Agent because of TLS fingerprinting, but the system `curl` binary is not
// fingerprinted the same way and an honest UA is accepted. `curl` is invoked through
// `execFile` (never a shell) with an explicit argv, so there's no injection surface from
// `storeUrl`/`userAgent`. Stops at the first empty page; designs are deduped by id.
export async function fetchTeepublicFeedDesigns(opts: {
  storeUrl: string;
  maxPages: number;
  minRequestIntervalMs: number;
  jitterMs: number;
  userAgent?: string;
}): Promise<{ designs: TeepublicDesign[]; errors: string[] }> {
  const pacer = new RequestPacer(opts.minRequestIntervalMs, opts.jitterMs);
  const userAgent = opts.userAgent || TEEPUBLIC_FEED_USER_AGENT;

  const errors: string[] = [];
  const byId = new Map<string, TeepublicDesign>();

  for (let page = 1; page <= opts.maxPages; page += 1) {
    await pacer.waitTurn();
    const url = `${opts.storeUrl}/feed?page=${page}`;

    let stdout: string;
    try {
      // `-w "\n%{http_code}"` appends the status code as a trailing line so it can be read
      // back without a second process (curl's exit code alone doesn't distinguish 403 from
      // other non-2xx statuses cleanly across curl versions).
      const result = await execFileAsync("curl", ["-sS", "-A", userAgent, "-w", "\n%{http_code}", url], {
        maxBuffer: 20 * 1024 * 1024,
      });
      stdout = result.stdout;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") {
        errors.push("curl is required for the TeePublic feed source");
      } else {
        errors.push(String(error));
      }
      break;
    }

    const splitAt = stdout.lastIndexOf("\n");
    const body = splitAt >= 0 ? stdout.slice(0, splitAt) : "";
    const status = Number((splitAt >= 0 ? stdout.slice(splitAt + 1) : stdout).trim());

    if (status !== 200 || isCloudflareChallengePage(body)) {
      errors.push(`TeePublic feed returned ${status || "an unexpected response"} for ${url}`);
      break;
    }

    const pageDesigns = parseTeepublicStorePage(body);
    if (pageDesigns.length === 0) break;
    for (const d of pageDesigns) {
      if (!byId.has(d.id)) byId.set(d.id, d);
    }
  }

  return { designs: Array.from(byId.values()), errors };
}

// Fetches TeePublic store listing pages (`?page=N`) through a Playwright session (TeePublic
// returns a Cloudflare 403 to plain fetch), stopping at the first page with 0 tiles. Page 1 is
// loaded with a real top-level navigation, which establishes the session's Cloudflare-clearance
// cookies; subsequent pages are fetched with `fetchInPage` (a same-origin `fetch()` run inside
// that already-cleared page) instead of a fresh `page.goto`, since a fresh navigation
// re-triggers the challenge on every page after the first even though the same cookies satisfy
// a same-origin `fetch`.
//
// In headful mode (`playwrightHeadless: false`) page 1 is a Cloudflare Turnstile checkbox that
// only a human clicking in the visible browser window can clear — the code never automates
// that click. It only navigates (`openPage`) and then passively waits (`waitForSelector`, up to
// `humanWaitMs`, default 3 minutes) for a design tile to appear before continuing.
export async function fetchTeepublicDesigns(opts: {
  storeUrl: string;
  maxPages: number;
  minRequestIntervalMs: number;
  jitterMs: number;
  playwrightHeadless: boolean;
  playwrightStorageStatePath?: string;
  userAgent?: string;
  humanWaitMs?: number;
}): Promise<{ designs: TeepublicDesign[]; errors: string[]; close: () => Promise<void> }> {
  const pacer = new RequestPacer(opts.minRequestIntervalMs, opts.jitterMs);
  const session = await createPlaywrightSession({
    headless: opts.playwrightHeadless,
    storageStatePath: opts.playwrightStorageStatePath,
    requestHeaders: { "user-agent": opts.userAgent || DEFAULT_DESKTOP_USER_AGENT },
  });

  const errors: string[] = [];
  const byId = new Map<string, TeepublicDesign>();

  for (let page = 1; page <= opts.maxPages; page += 1) {
    await pacer.waitTurn();

    let html: string;
    if (page === 1 && !opts.playwrightHeadless) {
      const humanWaitMs = opts.humanWaitMs ?? DEFAULT_HUMAN_WAIT_MS;
      console.log(
        `Waiting up to ${Math.round(humanWaitMs / 1000)}s for the TeePublic store to load — ` +
          "complete the Cloudflare check in the browser window if shown.",
      );
      try {
        await session.openPage(opts.storeUrl);
      } catch (error) {
        errors.push(String(error));
        break;
      }
      const loaded = await session.waitForSelector("div.tp-design-tile", humanWaitMs);
      if (!loaded) {
        errors.push(TEEPUBLIC_CHALLENGE_ERROR);
        break;
      }
      let result: { status: number; body: string };
      try {
        result = await session.fetchInPage(opts.storeUrl);
      } catch (error) {
        errors.push(String(error));
        break;
      }
      if (result.status !== 200 || isCloudflareChallengePage(result.body)) {
        errors.push(TEEPUBLIC_CHALLENGE_ERROR);
        break;
      }
      html = result.body;
    } else if (page === 1) {
      try {
        html = await session.fetchHtml(opts.storeUrl);
      } catch (error) {
        // `session.fetchHtml` already throws (rather than returning the page) when it detects
        // a Cloudflare challenge, so the raw HTML isn't available here to re-check with
        // `isCloudflareChallengePage` directly — the thrown message is inspected instead.
        errors.push(/cloudflare|challenge/i.test(String(error)) ? TEEPUBLIC_CHALLENGE_ERROR : String(error));
        break;
      }
      if (isCloudflareChallengePage(html)) {
        errors.push(TEEPUBLIC_CHALLENGE_ERROR);
        break;
      }
    } else {
      const pageUrl = `${opts.storeUrl}?page=${page}`;
      let result: { status: number; body: string };
      try {
        result = await session.fetchInPage(pageUrl);
      } catch (error) {
        errors.push(String(error));
        break;
      }
      if (result.status !== 200 || isCloudflareChallengePage(result.body)) {
        errors.push(TEEPUBLIC_CHALLENGE_ERROR);
        break;
      }
      html = result.body;
    }

    const pageDesigns = parseTeepublicStorePage(html);
    if (pageDesigns.length === 0) break;
    for (const d of pageDesigns) {
      if (!byId.has(d.id)) byId.set(d.id, d);
    }
  }

  return {
    designs: Array.from(byId.values()),
    errors,
    close: () => session.close(),
  };
}

// Pages through every `designs` row's externalId/title/props (matching columns only — no
// insert-relevant columns are ever read or written by this sync).
export async function loadDesignRows(supabase: SupabaseClient): Promise<DbDesignRow[]> {
  const PAGE_SIZE = 1000;
  const rows: DbDesignRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("designs")
      .select("externalId, title, props")
      .order("externalId")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Failed to page designs: ${error.message}`);
    }
    const page = (data as DbDesignRow[] | null) || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// Writes each matched design's TeePublic link into its existing row's `props`, preserving
// every other key already there (e.g. `mockup_tshirt`). Never inserts a row.
export async function applyTeepublicLinks(
  matched: TeepublicMatch[],
  options: { supabaseUrl: string; supabaseKey: string; dryRun?: boolean },
): Promise<{
  updated: number;
  unchanged: number;
  errors: string[];
  plan: Array<{ externalId: number; teepublic: string }>;
}> {
  const dryRun = options.dryRun ?? false;
  const supabase = createClient(options.supabaseUrl, options.supabaseKey);

  let updated = 0;
  let unchanged = 0;
  const errors: string[] = [];
  const plan: Array<{ externalId: number; teepublic: string }> = [];

  for (const m of matched) {
    const existingProps = m.row.props ?? {};
    if (existingProps.teepublicLink === m.teepublic.url && existingProps.teepublicId === m.teepublic.id) {
      unchanged += 1;
      continue;
    }

    const props = { ...existingProps, teepublicLink: m.teepublic.url, teepublicId: m.teepublic.id };

    if (dryRun) {
      plan.push({ externalId: m.row.externalId, teepublic: m.teepublic.url });
      continue;
    }

    const { error } = await supabase
      .from("designs")
      .update({ props, updatedAt: new Date().toISOString() })
      .eq("externalId", m.row.externalId);
    if (error) {
      errors.push(error.message);
    } else {
      updated += 1;
    }
  }

  return { updated, unchanged, errors, plan };
}
