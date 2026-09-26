import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked before importing lib/sync/teepublic (which imports these from lib/sync/redbubble),
// so fetchTeepublicDesigns tests can drive a fake Playwright session without touching Playwright.
// `vi.hoisted` is required because `vi.mock`'s factory is hoisted above these declarations.
const { fetchHtml, fetchInPage, openPage, waitForSelector, closeSession, createPlaywrightSession } = vi.hoisted(
  () => ({
    fetchHtml: vi.fn(),
    fetchInPage: vi.fn(),
    openPage: vi.fn(),
    waitForSelector: vi.fn(),
    closeSession: vi.fn(),
    createPlaywrightSession: vi.fn(),
  }),
);

vi.mock("@/lib/sync/redbubble", () => ({
  RequestPacer: class {
    async waitTurn() {}
  },
  createPlaywrightSession,
  isCloudflareChallengePage: (html: string) => /just a moment|cloudflare challenge/i.test(html),
}));

// Mocks `node:child_process`'s `execFile` for fetchTeepublicFeedDesigns tests — the real
// `curl` binary is never invoked. `execFileMock` is given the callback-style signature
// `util.promisify` expects (`(file, args, options, callback)`), since teepublic.ts promisifies
// this mock the same way it promisifies the real `execFile`.
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

import {
  normalizeTeepublicStoreUrl,
  canonicalTeepublicDesignUrl,
  parseTeepublicStorePage,
  normalizeTitle,
  titleSimilarity,
  matchTeepublicDesigns,
  splitMatches,
  applyTeepublicLinks,
  fetchTeepublicDesigns,
  fetchTeepublicFeedDesigns,
  type DbDesignRow,
  type TeepublicMatch,
} from "@/lib/sync/teepublic";

// ---------------------------------------------------------------------------
// parseTeepublicStorePage
// ---------------------------------------------------------------------------

function tile(opts: { id?: string; title?: string; url?: string; image?: string; withPreviewLink?: boolean }): string {
  const attrs: string[] = [];
  if (opts.id !== undefined) attrs.push(`data-design-id="${opts.id}"`);
  if (opts.title !== undefined) attrs.push(`data-gtm-design-title="${opts.title}"`);
  if (opts.url !== undefined) attrs.push(`data-url="${opts.url}"`);
  const previewLink =
    opts.withPreviewLink && opts.url
      ? `<a class="tp-design-image__preview_link" href="${opts.url}"></a>`
      : "";
  const image = opts.image ? `<img class="tp-design-tile__image" src="${opts.image}">` : "";
  return `<div class="tp-design-tile jsDesignContainer" ${attrs.join(" ")}>${previewLink}${image}</div>`;
}

function storePage(tilesHtml: string): string {
  return `<!doctype html><html><body><div class="tp-designs-list">${tilesHtml}</div></body></html>`;
}

describe("parseTeepublicStorePage", () => {
  it("parses a tile's id, entity-decoded title, canonical url (query stripped), and image", () => {
    const html = storePage(
      tile({
        id: "79297603",
        title: "Cats &amp; Coffee",
        url: "/t-shirt/79297603-i-do-what-i-want-coffee-loving-cat?store_id=3600489",
        image:
          "https://images.teepublic.com/derived/production/designs/79297603_0/1756058134/i_p:c_191919,s_313,q_90.jpg",
      }),
    );

    const designs = parseTeepublicStorePage(html);

    expect(designs).toHaveLength(1);
    expect(designs[0]).toEqual({
      id: "79297603",
      title: "Cats & Coffee",
      url: "https://www.teepublic.com/t-shirt/79297603-i-do-what-i-want-coffee-loving-cat",
      imageUrl:
        "https://images.teepublic.com/derived/production/designs/79297603_0/1756058134/i_p:c_191919,s_313,q_90.jpg",
    });
  });

  it("falls back to a.tp-design-image__preview_link href when data-url is missing", () => {
    const html = storePage(
      tile({
        id: "111",
        title: "Fallback Href",
        withPreviewLink: true,
        url: "/t-shirt/111-fallback-href",
      }).replace(/data-url="[^"]*"\s*/, ""),
    );

    const designs = parseTeepublicStorePage(html);

    expect(designs).toHaveLength(1);
    expect(designs[0].url).toBe("https://www.teepublic.com/t-shirt/111-fallback-href");
  });

  it("dedupes tiles that repeat the same design id", () => {
    const single = tile({ id: "222", title: "Dup", url: "/t-shirt/222-dup" });
    const html = storePage(single + single);

    const designs = parseTeepublicStorePage(html);

    expect(designs).toHaveLength(1);
  });

  it("skips a tile with no design id", () => {
    const html = storePage(tile({ title: "No Id", url: "/t-shirt/333-no-id" }));

    expect(parseTeepublicStorePage(html)).toEqual([]);
  });

  it("returns an empty array for a page with no tiles", () => {
    expect(parseTeepublicStorePage(storePage(""))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// canonicalTeepublicDesignUrl / normalizeTeepublicStoreUrl
// ---------------------------------------------------------------------------

describe("canonicalTeepublicDesignUrl", () => {
  it("resolves a relative href against teepublic.com and strips the query string", () => {
    expect(
      canonicalTeepublicDesignUrl(
        "/t-shirt/79297603-i-do-what-i-want-coffee-loving-cat?store_id=3600489",
      ),
    ).toBe("https://www.teepublic.com/t-shirt/79297603-i-do-what-i-want-coffee-loving-cat");
  });

  it("returns null for a foreign host", () => {
    expect(canonicalTeepublicDesignUrl("https://evil.com/t-shirt/1-x")).toBeNull();
  });

  it("returns null for an empty href", () => {
    expect(canonicalTeepublicDesignUrl("")).toBeNull();
  });

  it("returns null for a path with no product/id-slug shape", () => {
    expect(canonicalTeepublicDesignUrl("/user/threadquirk")).toBeNull();
  });
});

describe("normalizeTeepublicStoreUrl", () => {
  it("normalizes a /user/<name> URL unchanged (minus query)", () => {
    expect(normalizeTeepublicStoreUrl("https://www.teepublic.com/user/threadquirk")).toBe(
      "https://www.teepublic.com/user/threadquirk",
    );
  });

  it("normalizes a /stores/<name> URL to /user/<name>", () => {
    expect(normalizeTeepublicStoreUrl("https://www.teepublic.com/stores/threadquirk")).toBe(
      "https://www.teepublic.com/user/threadquirk",
    );
  });

  it("throws for a foreign host", () => {
    expect(() => normalizeTeepublicStoreUrl("https://evil.com/user/threadquirk")).toThrow();
  });

  it("throws for a path that isn't /user/<name> or /stores/<name>", () => {
    expect(() => normalizeTeepublicStoreUrl("https://www.teepublic.com/t-shirt/1-x")).toThrow();
  });

  it("throws for an empty input", () => {
    expect(() => normalizeTeepublicStoreUrl("")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// normalizeTitle / titleSimilarity
// ---------------------------------------------------------------------------

describe("normalizeTitle", () => {
  it("lowercases, expands &, strips punctuation, and collapses whitespace", () => {
    expect(normalizeTitle("I Do What I Want: Coffee & Cat!!")).toBe("i do what i want coffee and cat");
  });

  it("returns an empty string for an empty input", () => {
    expect(normalizeTitle("")).toBe("");
  });
});

describe("titleSimilarity", () => {
  it("returns 1 for titles that normalize identically", () => {
    expect(titleSimilarity("Coffee Loving Cat", "coffee loving cat")).toBe(1);
  });

  it("returns 0 for completely disjoint titles", () => {
    expect(titleSimilarity("Coffee Loving Cat", "Space Dog Rocket")).toBe(0);
  });

  it("returns 0 when both titles are empty after normalizing", () => {
    expect(titleSimilarity("!!!", "???")).toBe(0);
  });

  it("scores a partial word overlap between 0 and 1", () => {
    const score = titleSimilarity("Coffee Loving Cat", "Coffee Loving Dog");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// matchTeepublicDesigns
// ---------------------------------------------------------------------------

function tp(id: string, title: string): { id: string; title: string; url: string; imageUrl: string | null } {
  return { id, title, url: `https://www.teepublic.com/t-shirt/${id}-x`, imageUrl: null };
}

function row(externalId: number, title: string, props: Record<string, unknown> | null = null): DbDesignRow {
  return { externalId, title, props };
}

describe("matchTeepublicDesigns", () => {
  it("matches an exact normalized-title equality", () => {
    const result = matchTeepublicDesigns(
      [tp("1", "I Do What I Want: Coffee Loving Cat")],
      [row(5, "I do what i want - coffee loving cat")],
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({ score: 1, method: "exact" });
    expect(result.matched[0].row.externalId).toBe(5);
    expect(result.ambiguous).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });

  it("matches a fuzzy title above the threshold with a clear margin", () => {
    const result = matchTeepublicDesigns(
      [tp("1", "Coffee Loving Cat Design")],
      [row(5, "Coffee Loving Cat")],
      { threshold: 0.7, margin: 0.1 },
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].method).toBe("fuzzy");
    expect(result.matched[0].row.externalId).toBe(5);
  });

  it("leaves a design unmatched when the best score is below the threshold", () => {
    const result = matchTeepublicDesigns(
      [tp("1", "Completely Different Thing")],
      [row(5, "Coffee Loving Cat")],
      { threshold: 0.8 },
    );

    expect(result.matched).toEqual([]);
    expect(result.unmatched).toHaveLength(1);
  });

  it("marks a fuzzy candidate ambiguous when the margin over the runner-up isn't cleared", () => {
    const result = matchTeepublicDesigns(
      [tp("1", "Coffee Loving Cat Art")],
      [row(5, "Coffee Loving Cat"), row(6, "Coffee Loving Cat Print")],
      { threshold: 0.5, margin: 0.5 },
    );

    expect(result.matched).toEqual([]);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].candidates.map((c) => c.externalId).sort()).toEqual([5, 6]);
  });

  it("marks exact-title matches ambiguous when two DB rows share the same normalized title", () => {
    const result = matchTeepublicDesigns(
      [tp("1", "Same Title")],
      [row(5, "Same Title"), row(6, "same   title")],
    );

    expect(result.matched).toEqual([]);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].candidates.map((c) => c.externalId).sort()).toEqual([5, 6]);
  });

  it("claims a row 1:1 so a second TeePublic design competing for the same exact title is left unmatched", () => {
    const result = matchTeepublicDesigns(
      [tp("1", "Unique Title"), tp("2", "Unique Title")],
      [row(5, "Unique Title")],
    );

    expect(result.matched).toHaveLength(1);
    expect(result.ambiguous).toEqual([]);
    expect(result.unmatched).toHaveLength(1);
  });

  it("case/punctuation differences don't prevent an exact match", () => {
    const result = matchTeepublicDesigns(
      [tp("1", "HELLO, WORLD!!!")],
      [row(5, "hello world")],
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].method).toBe("exact");
  });
});

// ---------------------------------------------------------------------------
// splitMatches
// ---------------------------------------------------------------------------

describe("splitMatches", () => {
  it("separates exact matches from fuzzy matches, preserving order within each group", () => {
    const exact1 = match(row(1, "A"), "t1", "A", "https://www.teepublic.com/t-shirt/1-a", "exact");
    const fuzzy1 = match(row(2, "B"), "t2", "B-ish", "https://www.teepublic.com/t-shirt/2-b", "fuzzy");
    const exact2 = match(row(3, "C"), "t3", "C", "https://www.teepublic.com/t-shirt/3-c", "exact");

    const result = splitMatches([exact1, fuzzy1, exact2]);

    expect(result.exact).toEqual([exact1, exact2]);
    expect(result.fuzzy).toEqual([fuzzy1]);
  });

  it("returns empty arrays for an empty input", () => {
    expect(splitMatches([])).toEqual({ exact: [], fuzzy: [] });
  });
});

// ---------------------------------------------------------------------------
// fetchTeepublicDesigns
// ---------------------------------------------------------------------------

const STORE_URL = "https://www.teepublic.com/user/threadquirk";

function baseFetchOpts(overrides?: Partial<Parameters<typeof fetchTeepublicDesigns>[0]>) {
  return {
    storeUrl: STORE_URL,
    maxPages: 5,
    minRequestIntervalMs: 0,
    jitterMs: 0,
    playwrightHeadless: true,
    ...overrides,
  };
}

describe("fetchTeepublicDesigns", () => {
  beforeEach(() => {
    fetchHtml.mockReset();
    fetchInPage.mockReset();
    openPage.mockReset();
    waitForSelector.mockReset();
    closeSession.mockReset();
    createPlaywrightSession.mockReset();
    createPlaywrightSession.mockResolvedValue({ fetchHtml, fetchInPage, openPage, waitForSelector, close: closeSession });
  });

  it("loads page 1 via fetchHtml (top-level navigation) and pages >=2 via fetchInPage", async () => {
    fetchHtml.mockResolvedValueOnce(storePage(tile({ id: "1", title: "One", url: "/t-shirt/1-one" })));
    fetchInPage
      .mockResolvedValueOnce({
        status: 200,
        body: storePage(tile({ id: "2", title: "Two", url: "/t-shirt/2-two" })),
      })
      .mockResolvedValueOnce({ status: 200, body: storePage("") });

    const result = await fetchTeepublicDesigns(baseFetchOpts());

    expect(fetchHtml).toHaveBeenCalledWith(STORE_URL);
    expect(fetchInPage).toHaveBeenNthCalledWith(1, `${STORE_URL}?page=2`);
    expect(fetchInPage).toHaveBeenNthCalledWith(2, `${STORE_URL}?page=3`);
    expect(result.designs.map((d) => d.id).sort()).toEqual(["1", "2"]);
    expect(result.errors).toEqual([]);
    await result.close();
    expect(closeSession).toHaveBeenCalled();
  });

  it("stops and reports a challenge error when page 1's fetchHtml throws a challenge error", async () => {
    fetchHtml.mockRejectedValueOnce(new Error("returned Cloudflare challenge page"));

    const result = await fetchTeepublicDesigns(baseFetchOpts());

    expect(result.designs).toEqual([]);
    expect(fetchInPage).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Cloudflare challenge/);
  });

  it("stops and reports a challenge error when a later page's fetchInPage returns non-200", async () => {
    fetchHtml.mockResolvedValueOnce(storePage(tile({ id: "1", title: "One", url: "/t-shirt/1-one" })));
    fetchInPage.mockResolvedValueOnce({ status: 403, body: "<html>blocked</html>" });

    const result = await fetchTeepublicDesigns(baseFetchOpts());

    expect(result.designs.map((d) => d.id)).toEqual(["1"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Cloudflare challenge/);
  });

  it("passes a desktop user-agent (default or override) to createPlaywrightSession", async () => {
    fetchHtml.mockResolvedValueOnce(storePage(""));

    await fetchTeepublicDesigns(baseFetchOpts({ userAgent: "custom-ua" }));

    expect(createPlaywrightSession).toHaveBeenCalledWith(
      expect.objectContaining({ requestHeaders: { "user-agent": "custom-ua" } }),
    );
  });

  it("headful: navigates passively, waits for a human to clear the challenge, then fetches via fetchInPage", async () => {
    openPage.mockResolvedValueOnce(undefined);
    waitForSelector.mockResolvedValueOnce(true);
    fetchInPage
      .mockResolvedValueOnce({
        status: 200,
        body: storePage(tile({ id: "1", title: "One", url: "/t-shirt/1-one" })),
      })
      .mockResolvedValueOnce({ status: 200, body: storePage("") });

    const result = await fetchTeepublicDesigns(baseFetchOpts({ playwrightHeadless: false, humanWaitMs: 1000 }));

    expect(openPage).toHaveBeenCalledWith(STORE_URL);
    expect(waitForSelector).toHaveBeenCalledWith("div.tp-design-tile", 1000);
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(fetchInPage).toHaveBeenNthCalledWith(1, STORE_URL);
    expect(result.designs.map((d) => d.id)).toEqual(["1"]);
    expect(result.errors).toEqual([]);
  });

  it("headful: reports a challenge error when the human-wait for the selector times out", async () => {
    openPage.mockResolvedValueOnce(undefined);
    waitForSelector.mockResolvedValueOnce(false);

    const result = await fetchTeepublicDesigns(baseFetchOpts({ playwrightHeadless: false, humanWaitMs: 1000 }));

    expect(result.designs).toEqual([]);
    expect(fetchInPage).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Cloudflare challenge/);
  });
});

// ---------------------------------------------------------------------------
// fetchTeepublicFeedDesigns
// ---------------------------------------------------------------------------

type ExecFileCallback = (err: unknown, result?: { stdout: string; stderr: string }) => void;

function mockCurlOnce(fn: (file: string, args: string[]) => { stdout?: string; error?: unknown }) {
  execFileMock.mockImplementationOnce((file: string, args: string[], _options: unknown, callback: ExecFileCallback) => {
    const { stdout, error } = fn(file, args);
    if (error) callback(error);
    else callback(null, { stdout: stdout || "", stderr: "" });
  });
}

function curlBody(body: string, status: number): string {
  return `${body}\n${status}`;
}

function baseFeedOpts(overrides?: Partial<Parameters<typeof fetchTeepublicFeedDesigns>[0]>) {
  return {
    storeUrl: STORE_URL,
    maxPages: 5,
    minRequestIntervalMs: 0,
    jitterMs: 0,
    ...overrides,
  };
}

describe("fetchTeepublicFeedDesigns", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("concatenates designs across pages and stops at the first empty page", async () => {
    mockCurlOnce(() => ({
      stdout: curlBody(storePage(tile({ id: "1", title: "One", url: "/t-shirt/1-one" })), 200),
    }));
    mockCurlOnce(() => ({
      stdout: curlBody(storePage(tile({ id: "2", title: "Two", url: "/t-shirt/2-two" })), 200),
    }));
    mockCurlOnce(() => ({ stdout: curlBody(storePage(""), 200) }));

    const result = await fetchTeepublicFeedDesigns(baseFeedOpts());

    expect(result.designs.map((d) => d.id).sort()).toEqual(["1", "2"]);
    expect(result.errors).toEqual([]);
    expect(execFileMock).toHaveBeenCalledTimes(3);
  });

  it("invokes curl with the expected argv (no shell), UA, -w status suffix, and /feed?page=N URL", async () => {
    mockCurlOnce(() => ({ stdout: curlBody(storePage(""), 200) }));

    await fetchTeepublicFeedDesigns(baseFeedOpts({ userAgent: "my-ua" }));

    expect(execFileMock).toHaveBeenCalledWith(
      "curl",
      ["-sS", "-A", "my-ua", "-w", "\n%{http_code}", `${STORE_URL}/feed?page=1`],
      expect.objectContaining({ maxBuffer: expect.any(Number) }),
      expect.any(Function),
    );
  });

  it("stops and reports an error on a non-200 status", async () => {
    mockCurlOnce(() => ({ stdout: curlBody("<html>forbidden</html>", 403) }));

    const result = await fetchTeepublicFeedDesigns(baseFeedOpts());

    expect(result.designs).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("403");
    expect(result.errors[0]).toContain(`${STORE_URL}/feed?page=1`);
  });

  it("stops and reports an error when the body is a Cloudflare challenge page despite a 200 status", async () => {
    mockCurlOnce(() => ({ stdout: curlBody("<html>Just a moment...</html>", 200) }));

    const result = await fetchTeepublicFeedDesigns(baseFeedOpts());

    expect(result.designs).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("reports a clear error when curl isn't installed (ENOENT)", async () => {
    const enoent = Object.assign(new Error("spawn curl ENOENT"), { code: "ENOENT" });
    mockCurlOnce(() => ({ error: enoent }));

    const result = await fetchTeepublicFeedDesigns(baseFeedOpts());

    expect(result.designs).toEqual([]);
    expect(result.errors).toEqual(["curl is required for the TeePublic feed source"]);
  });
});

// ---------------------------------------------------------------------------
// applyTeepublicLinks
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

let updateCalls: { changes: Row; filters: { col: string; val: unknown }[] }[] = [];
let updateResponses: { error: { message: string } | null }[] = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      update: (changes: Row) => ({
        eq: (col: string, val: unknown) => {
          updateCalls.push({ changes, filters: [{ col, val }] });
          const queued = updateResponses.shift();
          return Promise.resolve(queued || { error: null });
        },
      }),
    }),
  })),
}));

function match(
  row: DbDesignRow,
  teepublicId: string,
  teepublicTitle: string,
  url: string,
  method: "exact" | "fuzzy" = "exact",
): TeepublicMatch {
  return {
    row,
    teepublic: { id: teepublicId, title: teepublicTitle, url, imageUrl: null },
    score: 1,
    method,
  };
}

describe("applyTeepublicLinks", () => {
  beforeEach(() => {
    updateCalls = [];
    updateResponses = [];
  });

  it("preserves existing props keys (e.g. mockup_tshirt) when writing the TeePublic link", async () => {
    const r = row(5, "Design A", { mockup_tshirt: "https://existing.example/m.jpg" });
    const result = await applyTeepublicLinks(
      [match(r, "111", "Design A", "https://www.teepublic.com/t-shirt/111-design-a")],
      { supabaseUrl: "https://fake.supabase.co", supabaseKey: "fake-key" },
    );

    expect(result.updated).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].changes.props).toEqual({
      mockup_tshirt: "https://existing.example/m.jpg",
      teepublicLink: "https://www.teepublic.com/t-shirt/111-design-a",
      teepublicId: "111",
    });
    expect(typeof updateCalls[0].changes.updatedAt).toBe("string");
    expect(updateCalls[0].filters).toEqual([{ col: "externalId", val: 5 }]);
  });

  it("skips a row whose props already match the TeePublic link (unchanged, no update call)", async () => {
    const r = row(5, "Design A", {
      teepublicLink: "https://www.teepublic.com/t-shirt/111-design-a",
      teepublicId: "111",
    });
    const result = await applyTeepublicLinks(
      [match(r, "111", "Design A", "https://www.teepublic.com/t-shirt/111-design-a")],
      { supabaseUrl: "https://fake.supabase.co", supabaseKey: "fake-key" },
    );

    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("dryRun makes no update calls and returns the plan instead", async () => {
    const r = row(5, "Design A", null);
    const result = await applyTeepublicLinks(
      [match(r, "111", "Design A", "https://www.teepublic.com/t-shirt/111-design-a")],
      { supabaseUrl: "https://fake.supabase.co", supabaseKey: "fake-key", dryRun: true },
    );

    expect(updateCalls).toHaveLength(0);
    expect(result.updated).toBe(0);
    expect(result.plan).toEqual([
      { externalId: 5, teepublic: "https://www.teepublic.com/t-shirt/111-design-a" },
    ]);
  });

  it("collects an update error without throwing", async () => {
    const r = row(5, "Design A", null);
    updateResponses = [{ error: { message: "update failed" } }];

    const result = await applyTeepublicLinks(
      [match(r, "111", "Design A", "https://www.teepublic.com/t-shirt/111-design-a")],
      { supabaseUrl: "https://fake.supabase.co", supabaseKey: "fake-key" },
    );

    expect(result.updated).toBe(0);
    expect(result.errors).toContain("update failed");
  });
});
