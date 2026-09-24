import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeShopUrl,
  extractExternalIdFromUrl,
  RequestPacer,
  syncRedbubbleToSupabase,
} from "@/lib/sync/redbubble";

// ---------------------------------------------------------------------------
// normalizeShopUrl
// ---------------------------------------------------------------------------

describe("normalizeShopUrl", () => {
  it("converts a bare username to a full shop URL", () => {
    expect(normalizeShopUrl("someartist")).toBe(
      "https://www.redbubble.com/people/someartist/shop",
    );
  });

  it("strips a leading @ from a username", () => {
    expect(normalizeShopUrl("@someartist")).toBe(
      "https://www.redbubble.com/people/someartist/shop",
    );
  });

  it("accepts a full https URL unchanged (minus trailing slash)", () => {
    expect(normalizeShopUrl("https://www.redbubble.com/people/someartist/shop")).toBe(
      "https://www.redbubble.com/people/someartist/shop",
    );
  });

  it("rewrites /explore to /shop", () => {
    expect(normalizeShopUrl("https://www.redbubble.com/people/someartist/explore")).toBe(
      "https://www.redbubble.com/people/someartist/shop",
    );
  });

  it("rejects http (non-https) URLs", () => {
    expect(normalizeShopUrl("http://www.redbubble.com/people/someartist/shop")).toBe("");
  });

  it("rejects foreign hosts", () => {
    expect(normalizeShopUrl("https://evil.com/people/x/shop")).toBe("");
  });

  it("strips a trailing slash", () => {
    expect(normalizeShopUrl("https://www.redbubble.com/people/someartist/shop/")).toBe(
      "https://www.redbubble.com/people/someartist/shop",
    );
  });

  it("accepts a schemeless www.redbubble.com/people/x/shop path", () => {
    expect(normalizeShopUrl("www.redbubble.com/people/someartist/shop")).toBe(
      "https://www.redbubble.com/people/someartist/shop",
    );
  });

  it("returns empty string for invalid username characters", () => {
    expect(normalizeShopUrl("some artist!")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// extractExternalIdFromUrl
// ---------------------------------------------------------------------------

describe("extractExternalIdFromUrl", () => {
  it("extracts the id from a typical /i/ product URL", () => {
    expect(
      extractExternalIdFromUrl(
        "https://www.redbubble.com/i/t-shirt/Some-Title-by-artist/12345678.FB110",
      ),
    ).toBe(12345678);
  });

  it("extracts the id from a /shop/ap/ URL", () => {
    expect(extractExternalIdFromUrl("https://www.redbubble.com/shop/ap/12345678")).toBe(
      12345678,
    );
  });

  it("returns null when the URL has no id", () => {
    expect(extractExternalIdFromUrl("https://www.redbubble.com/people/someartist/shop")).toBe(
      null,
    );
  });

  it("documents the 6+ digit fallback: a bare 6+ digit run anywhere is picked up", () => {
    // No /i/, /works/, /shop/ap/ pattern, and no [/-] prefix before the digits per the
    // primary regex, but the loose 6+ digit fallback regex still matches. This means
    // any incidental long number in a URL (e.g. a timestamp) can be misread as an id.
    expect(extractExternalIdFromUrl("https://www.redbubble.com/foo123456bar")).toBe(123456);
  });
});

// ---------------------------------------------------------------------------
// RequestPacer
// ---------------------------------------------------------------------------

describe("RequestPacer", () => {
  it("spaces two consecutive waitTurn() calls by at least minIntervalMs", async () => {
    const minIntervalMs = 50;
    const pacer = new RequestPacer(minIntervalMs, 0);

    const start = Date.now();
    await pacer.waitTurn();
    const afterFirst = Date.now();
    await pacer.waitTurn();
    const afterSecond = Date.now();

    // First call should not be throttled (no prior request).
    expect(afterFirst - start).toBeLessThan(minIntervalMs);
    // Second call must be spaced by at least minIntervalMs from the first.
    expect(afterSecond - afterFirst).toBeGreaterThanOrEqual(minIntervalMs - 5);
  });
});

// ---------------------------------------------------------------------------
// syncRedbubbleToSupabase (end-to-end with mocked network + supabase)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type MockResponse = { data: Row[] | null; error: { message: string } | null };

type Call =
  | { type: "select-in"; table: string; col: string; vals: unknown[] }
  | { type: "select-filter"; table: string; col: string; op: string; value: string }
  | { type: "insert"; table: string; rows: Row[] }
  | { type: "upsert"; table: string; rows: Row[]; opts: Record<string, unknown> };

let calls: Call[] = [];
let selectByIdResponses: MockResponse[] = [];
let selectByTitleResponses: MockResponse[] = [];
let insertResponses: MockResponse[] = [];
let upsertResponses: MockResponse[] = [];

function nextOr(queue: MockResponse[], rows: Row[]): Promise<MockResponse> {
  const queued = queue.shift();
  if (queued) return Promise.resolve(queued);
  return Promise.resolve({ data: rows.map(() => ({ id: "generated-id" })), error: null });
}

function nextSelectResponse(queue: MockResponse[]): Promise<MockResponse> {
  const queued = queue.shift();
  if (queued) return Promise.resolve(queued);
  return Promise.resolve({ data: [], error: null });
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => ({
        in: (col: string, vals: unknown[]) => {
          calls.push({ type: "select-in", table, col, vals });
          return nextSelectResponse(col === "externalId" ? selectByIdResponses : selectByTitleResponses);
        },
        filter: (col: string, op: string, value: string) => {
          calls.push({ type: "select-filter", table, col, op, value });
          return nextSelectResponse(col === "externalId" ? selectByIdResponses : selectByTitleResponses);
        },
      }),
      insert: (rows: Row[]) => ({
        select: () => {
          calls.push({ type: "insert", table, rows });
          return nextOr(insertResponses, rows);
        },
      }),
      upsert: (rows: Row[], opts: Record<string, unknown>) => ({
        select: () => {
          calls.push({ type: "upsert", table, rows, opts });
          return nextOr(upsertResponses, rows);
        },
      }),
    }),
  })),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(() => {
      throw new Error("playwright must not be launched when usePlaywright: false");
    }),
  },
}));

function productHtml(opts: {
  name: string;
  description: string;
  image: string;
  url: string;
  keywords?: string;
}): string {
  return `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      "@type": "Product",
      name: opts.name,
      description: opts.description,
      image: opts.image,
      url: opts.url,
    })}</script>
    <meta name="keywords" content="${opts.keywords || ""}">
  </head><body><h1>${opts.name}</h1></body></html>`;
}

function shopPageHtml(links: string[]): string {
  const anchors = links.map((l) => `<a href="${l}">link</a>`).join("\n");
  return `<!doctype html><html><body>${anchors}</body></html>`;
}

const CLOUDFLARE_HTML = `<!doctype html><html><body>Just a moment...</body></html>`;

function baseOptions(overrides?: Partial<Parameters<typeof syncRedbubbleToSupabase>[0]>) {
  return {
    shopUrl: "someartist",
    supabaseUrl: "https://fake.supabase.co",
    supabaseKey: "fake-key",
    usePlaywright: false,
    pageDelayMs: 0,
    minRequestIntervalMs: 0,
    jitterMs: 0,
    maxPages: 2,
    concurrency: 1,
    ...overrides,
  };
}

const SHOP_URL = "https://www.redbubble.com/people/someartist/shop";

function insertCalls(): Extract<Call, { type: "insert" }>[] {
  return calls.filter((c): c is Extract<Call, { type: "insert" }> => c.type === "insert");
}

function upsertCalls(): Extract<Call, { type: "upsert" }>[] {
  return calls.filter((c): c is Extract<Call, { type: "upsert" }> => c.type === "upsert");
}

function filterCalls(): Extract<Call, { type: "select-filter" }>[] {
  return calls.filter((c): c is Extract<Call, { type: "select-filter" }> => c.type === "select-filter");
}

function selectInCalls(): Extract<Call, { type: "select-in" }>[] {
  return calls.filter((c): c is Extract<Call, { type: "select-in" }> => c.type === "select-in");
}

function mockShopAndProducts(productUrls: string[], productHtmls: Record<string, string>) {
  return vi.fn(async (url: string) => {
    const u = url.toString();
    if (u.startsWith(SHOP_URL) && u.includes("page=1")) {
      return new Response(shopPageHtml(productUrls), { status: 200 });
    }
    if (u.startsWith(SHOP_URL) && u.includes("page=2")) {
      return new Response(shopPageHtml([]), { status: 200 });
    }
    if (productHtmls[u]) {
      return new Response(productHtmls[u], { status: 200 });
    }
    throw new Error(`unexpected fetch: ${u}`);
  });
}

function existingRow(overrides: Partial<Row> = {}) {
  return {
    id: "existing-uuid-1",
    externalId: 11111111,
    title: "Old Title",
    description: "Hand-written",
    keywords: "existing keywords",
    category: "existing category",
    collection: "Cats",
    backgroundColor: "#000000",
    backgroundColors: "custom",
    shared: false,
    props: { custom: true },
    imageName: "old.jpg",
    externalImageUrl: "https://ih1.redbubble.net/old.jpg",
    externalLink: "https://www.redbubble.com/i/t-shirt/Old-Title/11111111.FB110",
    createdAt: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("syncRedbubbleToSupabase", () => {
  beforeEach(() => {
    calls = [];
    selectByIdResponses = [];
    selectByTitleResponses = [];
    insertResponses = [];
    upsertResponses = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("inserts brand new rows and does not call upsert", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const fetchMock = mockShopAndProducts([productA], {
      [productA]: productHtml({
        name: "Design A",
        description: "Desc A",
        image: "https://ih1.redbubble.net/image.111.jpg",
        url: productA,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const inserts = insertCalls();
    const upserts = upsertCalls();
    expect(inserts).toHaveLength(1);
    expect(upserts).toHaveLength(0);
    expect(inserts[0].rows).toHaveLength(1);
    expect(inserts[0].rows[0].externalId).toBe(11111111);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.dryRun).toBe(false);
  });

  it("updates an existing row via upsert, keeping curated fields and refreshing link/image/title", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const fetchMock = mockShopAndProducts([productA], {
      [productA]: productHtml({
        name: "Design A",
        description: "Desc A",
        image: "https://ih1.redbubble.net/image.111.jpg",
        url: productA,
        keywords: "",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: [existingRow()], error: null }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const upserts = upsertCalls();
    const inserts = insertCalls();
    expect(inserts).toHaveLength(0);
    expect(upserts).toHaveLength(1);
    const row = upserts[0].rows[0] as Row;

    // Curated fields preserved.
    expect(row.description).toBe("Hand-written");
    expect(row.collection).toBe("Cats");
    expect(row.category).toBe("existing category");
    expect(row.keywords).toBe("existing keywords");
    expect(row.backgroundColor).toBe("#000000");
    expect(row.backgroundColors).toBe("custom");
    expect(row.shared).toBe(false);
    expect(row.props).toEqual({ custom: true });
    expect(row.id).toBe("existing-uuid-1");
    expect(row.createdAt).toBe("2020-01-01T00:00:00.000Z");

    // Refreshed fields.
    expect(row.title).toBe("Design A");
    expect(row.externalImageUrl).toBe("https://ih1.redbubble.net/image.111.jpg");
    expect(row.imageName).toBe("image.111.jpg");
    expect(typeof row.updatedAt).toBe("string");

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
  });

  it("fills an empty curated field with the scraped value when the existing value is empty", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const fetchMock = mockShopAndProducts([productA], {
      [productA]: productHtml({
        name: "Design A",
        description: "Fresh description",
        image: "https://ih1.redbubble.net/image.111.jpg",
        url: productA,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: [existingRow({ description: "" })], error: null }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const upserts = upsertCalls();
    expect(upserts).toHaveLength(1);
    expect(upserts[0].rows[0].description).toBe("Fresh description");
    expect(result.updated).toBe(1);
  });

  it("skips the second row of an in-batch title collision and records a warning", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Same-Title-by-someartist/33333333.FB110";
    const productB = "https://www.redbubble.com/i/sticker/Same-Title-by-someartist/44444444.ST123";
    const fetchMock = mockShopAndProducts([productA, productB], {
      [productA]: productHtml({
        name: "Same Title",
        description: "Desc A",
        image: "https://ih1.redbubble.net/image.333.jpg",
        url: productA,
      }),
      [productB]: productHtml({
        name: "Same Title",
        description: "Desc B",
        image: "https://ih1.redbubble.net/image.444.jpg",
        url: productB,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const inserts = insertCalls();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows).toHaveLength(1);
    expect(inserts[0].rows[0].externalId).toBe(33333333);
    expect(result.skipped).toBe(1);
    expect(
      result.warnings.some(
        (w) => w.includes("44444444") && w.includes("duplicates externalId 33333333"),
      ),
    ).toBe(true);
  });

  it("skips a row whose title is already owned by a different externalId in the database", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/55555555.FB110";
    const fetchMock = mockShopAndProducts([productA], {
      [productA]: productHtml({
        name: "Design A",
        description: "Desc A",
        image: "https://ih1.redbubble.net/image.555.jpg",
        url: productA,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByTitleResponses = [
      { data: [{ externalId: 99999999, title: "Design A" }], error: null },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(insertCalls()).toHaveLength(0);
    expect(upsertCalls()).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(
      result.warnings.some((w) => w.includes("55555555") && w.includes("99999999")),
    ).toBe(true);
  });

  it("dryRun: true makes no write calls and returns the would-be plan", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const productB = "https://www.redbubble.com/i/sticker/Design-B-by-someartist/22222222.ST123";
    const fetchMock = mockShopAndProducts([productA, productB], {
      [productA]: productHtml({
        name: "Design A",
        description: "Desc A",
        image: "https://ih1.redbubble.net/image.111.jpg",
        url: productA,
      }),
      [productB]: productHtml({
        name: "Design B",
        description: "Desc B",
        image: "https://ih1.redbubble.net/image.222.jpg",
        url: productB,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [
      { data: [existingRow({ externalId: 22222222, title: "Old B" })], error: null },
    ];

    const result = await syncRedbubbleToSupabase(
      baseOptions({ shopUrl: SHOP_URL, dryRun: true }),
    );

    expect(insertCalls()).toHaveLength(0);
    expect(upsertCalls()).toHaveLength(0);
    expect(result.dryRun).toBe(true);
    expect(result.plan?.insert).toHaveLength(1);
    expect(result.plan?.update).toHaveLength(1);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(1);
  });

  it("continues with the next insert chunk when one chunk of >100 new rows fails", async () => {
    const count = 101;
    const productUrls: string[] = [];
    const productHtmls: Record<string, string> = {};
    for (let i = 0; i < count; i += 1) {
      const id = 90000000 + i;
      const url = `https://www.redbubble.com/i/t-shirt/Title-${i}-by-someartist/${id}.FB110`;
      productUrls.push(url);
      productHtmls[url] = productHtml({
        name: `Title ${i}`,
        description: `Desc ${i}`,
        image: `https://ih1.redbubble.net/image.${id}.jpg`,
        url,
      });
    }
    const fetchMock = mockShopAndProducts(productUrls, productHtmls);
    vi.stubGlobal("fetch", fetchMock);

    insertResponses = [{ data: null, error: { message: "insert failed" } }];

    const result = await syncRedbubbleToSupabase(
      baseOptions({ shopUrl: SHOP_URL, maxPages: 2 }),
    );

    const inserts = insertCalls();
    expect(inserts).toHaveLength(2);
    expect(inserts[0].rows).toHaveLength(100);
    expect(inserts[1].rows).toHaveLength(1);
    expect(result.errors).toBe(100);
    expect(result.errorMessages).toContain("insert failed");
    expect(result.inserted).toBe(1);
  });

  it("reports the SELECT error and makes no insert/upsert calls", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/55555555.FB110";
    const fetchMock = mockShopAndProducts([productA], {
      [productA]: productHtml({
        name: "Design A",
        description: "Desc A",
        image: "https://ih1.redbubble.net/image.555.jpg",
        url: productA,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: null, error: { message: "select failed" } }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(insertCalls()).toHaveLength(0);
    expect(upsertCalls()).toHaveLength(0);
    expect(result.errors).toBe(1);
    expect(result.errorMessages).toContain("select failed");
  });

  it("escapes quotes/commas in a title for the PostgREST `in` filter and still syncs the row", async () => {
    const productA =
      "https://www.redbubble.com/i/t-shirt/Weird-Title-by-someartist/12121212.FB110";
    const weirdTitle = `24", 36" Print, Set of 2`;
    const fetchMock = mockShopAndProducts([productA], {
      [productA]: productHtml({
        name: weirdTitle,
        description: "Desc",
        image: "https://ih1.redbubble.net/image.121.jpg",
        url: productA,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const filters = filterCalls();
    expect(filters).toHaveLength(1);
    expect(filters[0].col).toBe("title");
    expect(filters[0].op).toBe("in");
    expect(filters[0].value).toBe(`("24\\", 36\\" Print, Set of 2")`);

    const inserts = insertCalls();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows[0].title).toBe(weirdTitle);
    expect(result.inserted).toBe(1);
    expect(result.errors).toBe(0);
  });

  it("makes a title-lookup chunk failure non-fatal: only that chunk's rows are dropped, others still written", async () => {
    const count = 30; // > 25 (title chunk size) so it spans two title-lookup chunks
    const productUrls: string[] = [];
    const productHtmls: Record<string, string> = {};
    for (let i = 0; i < count; i += 1) {
      const id = 80000000 + i;
      const url = `https://www.redbubble.com/i/t-shirt/Title-${i}-by-someartist/${id}.FB110`;
      productUrls.push(url);
      productHtmls[url] = productHtml({
        name: `Title ${i}`,
        description: `Desc ${i}`,
        image: `https://ih1.redbubble.net/image.${id}.jpg`,
        url,
      });
    }
    const fetchMock = mockShopAndProducts(productUrls, productHtmls);
    vi.stubGlobal("fetch", fetchMock);

    selectByTitleResponses = [{ data: null, error: { message: "title lookup failed" } }];

    const result = await syncRedbubbleToSupabase(
      baseOptions({ shopUrl: SHOP_URL, maxPages: 2 }),
    );

    expect(filterCalls()).toHaveLength(2);
    const inserts = insertCalls();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows).toHaveLength(5); // second chunk (rows 25-29)
    expect(result.errors).toBe(25);
    expect(result.errorMessages).toContain("title lookup failed");
    expect(result.inserted).toBe(5);
  });

  it("makes an id-lookup chunk failure non-fatal: only that chunk's rows are dropped, others still written", async () => {
    const count = 105; // > 100 (id chunk size) so it spans two id-lookup chunks
    const productUrls: string[] = [];
    const productHtmls: Record<string, string> = {};
    for (let i = 0; i < count; i += 1) {
      const id = 70000000 + i;
      const url = `https://www.redbubble.com/i/t-shirt/Title-${i}-by-someartist/${id}.FB110`;
      productUrls.push(url);
      productHtmls[url] = productHtml({
        name: `Title ${i}`,
        description: `Desc ${i}`,
        image: `https://ih1.redbubble.net/image.${id}.jpg`,
        url,
      });
    }
    const fetchMock = mockShopAndProducts(productUrls, productHtmls);
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: null, error: { message: "id lookup failed" } }];

    const result = await syncRedbubbleToSupabase(
      baseOptions({ shopUrl: SHOP_URL, maxPages: 2 }),
    );

    expect(selectInCalls()).toHaveLength(2);
    const inserts = insertCalls();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows).toHaveLength(5); // second id chunk (rows 100-104)
    expect(result.errors).toBe(100);
    expect(result.errorMessages).toContain("id lookup failed");
    expect(result.inserted).toBe(5);
  });

  it("does not double-count errors when both id-lookup and title-lookup fail for the same rows", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/61111111.FB110";
    const productB = "https://www.redbubble.com/i/sticker/Design-B-by-someartist/62222222.ST123";
    const productC = "https://www.redbubble.com/i/mug/Design-C-by-someartist/63333333.MG100";
    const fetchMock = mockShopAndProducts([productA, productB, productC], {
      [productA]: productHtml({
        name: "Design A",
        description: "Desc A",
        image: "https://ih1.redbubble.net/image.611.jpg",
        url: productA,
      }),
      [productB]: productHtml({
        name: "Design B",
        description: "Desc B",
        image: "https://ih1.redbubble.net/image.622.jpg",
        url: productB,
      }),
      [productC]: productHtml({
        name: "Design C",
        description: "Desc C",
        image: "https://ih1.redbubble.net/image.633.jpg",
        url: productC,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: null, error: { message: "id lookup failed" } }];
    selectByTitleResponses = [{ data: null, error: { message: "title lookup failed" } }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(insertCalls()).toHaveLength(0);
    expect(upsertCalls()).toHaveLength(0);
    // 3 rows failed both lookups: must be counted once each, not once per failing lookup.
    expect(result.errors).toBe(3);
    expect(result.errorMessages).toContain("id lookup failed");
    expect(result.errorMessages).toContain("title lookup failed");
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
  });

  it("collects the error and does not throw when the insert fails (e.g. RLS violation)", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/55555555.FB110";
    const fetchMock = mockShopAndProducts([productA], {
      [productA]: productHtml({
        name: "Design A",
        description: "Desc A",
        image: "https://ih1.redbubble.net/image.555.jpg",
        url: productA,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    insertResponses = [
      { data: null, error: { message: "new row violates row-level security policy" } },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(insertCalls()).toHaveLength(1);
    expect(result.errors).toBe(1);
    expect(result.errorMessages).toContain("new row violates row-level security policy");
    expect(result.inserted).toBe(0);
  });

  it("collects an error for a Cloudflare-challenged product page but still syncs the rest", async () => {
    const productGood = "https://www.redbubble.com/i/t-shirt/Design-Good-by-someartist/66666666.FB110";
    const productBlocked = "https://www.redbubble.com/i/sticker/Design-Blocked-by-someartist/77777777.ST123";

    const fetchMock = mockShopAndProducts([productGood, productBlocked], {
      [productGood]: productHtml({
        name: "Design Good",
        description: "Desc",
        image: "https://ih1.redbubble.net/image.666.jpg",
        url: productGood,
      }),
      [productBlocked]: CLOUDFLARE_HTML,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const inserts = insertCalls();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows).toHaveLength(1);
    expect(inserts[0].rows[0].externalId).toBe(66666666);
    expect(result.errorMessages.some((m) => /Cloudflare/i.test(m))).toBe(true);
    expect(result.inserted).toBe(1);
  });

  it("does not call insert/upsert and reports all links as skipped when the shop page has 0 links", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.startsWith(SHOP_URL)) {
        return new Response(shopPageHtml([]), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(calls).toHaveLength(0);
    expect(result.fetchedProductLinks).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.warnings).toEqual([]);
  });
});
