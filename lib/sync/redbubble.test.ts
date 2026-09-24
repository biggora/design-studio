import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeShopUrl,
  extractExternalIdFromUrl,
  RequestPacer,
  syncRedbubbleToSupabase,
  parseShopNextData,
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
type DeleteFilter = { op: "eq" | "in" | "not-in"; col: string; val: unknown };

type Call =
  | { type: "select-in"; table: string; col: string; vals: unknown[] }
  | { type: "select-filter"; table: string; col: string; op: string; value: string }
  | { type: "insert"; table: string; rows: Row[] }
  | { type: "upsert"; table: string; rows: Row[]; opts: Record<string, unknown> }
  | { type: "delete"; table: string; filters: DeleteFilter[] };

let calls: Call[] = [];
let selectByIdResponses: MockResponse[] = [];
let selectByTitleResponses: MockResponse[] = [];
let insertResponses: MockResponse[] = [];
let upsertResponses: MockResponse[] = [];
let collectionsUpsertResponses: MockResponse[] = [];
let designIdLookupResponses: MockResponse[] = [];
let designCollectionsUpsertResponses: MockResponse[] = [];
let designCollectionsDeleteResponses: MockResponse[] = [];

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

// Default id-resolution response: echoes back a synthetic design id for every requested
// externalId, so tests that don't care about the collections wiring still get links written.
function nextIdLookupResponse(queue: MockResponse[], vals: unknown[]): Promise<MockResponse> {
  const queued = queue.shift();
  if (queued) return Promise.resolve(queued);
  return Promise.resolve({
    data: (vals as number[]).map((v) => ({ id: `design-id-${v}`, externalId: v })),
    error: null,
  });
}

function nextCollectionsUpsertResponse(queue: MockResponse[], rows: Row[]): Promise<MockResponse> {
  const queued = queue.shift();
  if (queued) return Promise.resolve(queued);
  return Promise.resolve({
    data: rows.map((r) => ({ id: `col-id-${r.externalId}`, externalId: r.externalId })),
    error: null,
  });
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => ({
      select: (cols?: string) => ({
        in: (col: string, vals: unknown[]) => {
          calls.push({ type: "select-in", table, col, vals });
          if (table === "designs" && cols === "id, externalId") {
            return nextIdLookupResponse(designIdLookupResponses, vals);
          }
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
          if (table === "collections") return nextCollectionsUpsertResponse(collectionsUpsertResponses, rows);
          if (table === "design_collections") return nextOr(designCollectionsUpsertResponses, rows);
          return nextOr(upsertResponses, rows);
        },
      }),
      // Real supabase-js filter builders are themselves thenables (no terminal method is
      // required) — mimic that so `.delete().eq(...).in(...)` / `.delete().in(...).not(...)`
      // both resolve once awaited, recording every chained filter on one Call.
      delete: () => {
        const filters: DeleteFilter[] = [];
        const builder = {
          eq(col: string, val: unknown) {
            filters.push({ op: "eq", col, val });
            return builder;
          },
          in(col: string, vals: unknown[]) {
            filters.push({ op: "in", col, val: vals });
            return builder;
          },
          not(col: string, _op: string, val: unknown) {
            filters.push({ op: "not-in", col, val });
            return builder;
          },
          then(
            resolve: (r: MockResponse) => unknown,
            reject?: (e: unknown) => unknown,
          ) {
            calls.push({ type: "delete", table, filters: [...filters] });
            return nextSelectResponse(designCollectionsDeleteResponses).then(resolve, reject);
          },
        };
        return builder;
      },
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

function deleteCalls(): Extract<Call, { type: "delete" }>[] {
  return calls.filter((c): c is Extract<Call, { type: "delete" }> => c.type === "delete");
}

function forTable<T extends Call>(list: T[], table: string): T[] {
  return list.filter((c) => c.table === table);
}

// ---------------------------------------------------------------------------
// __NEXT_DATA__ shop-page fixtures (structure verified against a live shop page,
// see notes referenced in the sync module dispatch).
// ---------------------------------------------------------------------------

function nextDataHtml(pageProps: Record<string, unknown>): string {
  const data = { props: { pageProps } };
  return `<!doctype html><html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    data,
  )}</script></head><body></body></html>`;
}

function rbResultEntry(opts: {
  workId: number;
  title: string;
  tags?: string[];
  productPageUrl: string;
  imageUrl: string;
}) {
  return {
    inventoryItem: {
      productPageUrl: opts.productPageUrl,
      previewSet: { previews: [{ previewTypeId: "product_close", url: opts.imageUrl }] },
      work: { id: String(opts.workId), title: opts.title, tags: opts.tags || [] },
    },
  };
}

function rbCollection(id: number, title: string) {
  return { id, title, description: null, coverImageUrl: null };
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
    collectionsUpsertResponses = [];
    designIdLookupResponses = [];
    designCollectionsUpsertResponses = [];
    designCollectionsDeleteResponses = [];
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

  it("requests shop listing pages with a stable sortOrder=recent", async () => {
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

    await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const listingUrls = fetchMock.mock.calls
      .map(([url]) => url.toString())
      .filter((u) => u.startsWith(SHOP_URL) && u.includes("page="));
    expect(listingUrls.length).toBeGreaterThan(0);
    for (const u of listingUrls) {
      expect(u).toContain("sortOrder=recent");
    }
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

// ---------------------------------------------------------------------------
// parseShopNextData
// ---------------------------------------------------------------------------

describe("parseShopNextData", () => {
  it("maps results[].inventoryItem into DesignRecord fields", () => {
    const html = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 173146884,
          title: "Handyman Repairman Problem Solver",
          tags: ["fix", "repair"],
          productPageUrl:
            "https://www.redbubble.com/i/hoodie/Handyman-Repairman-Problem-Solver-by-ThreadQuirk/173146884/lgcw",
          imageUrl: "https://ih1.redbubble.net/image.5909636486.6884/a.jpg",
        }),
      ],
      pagination: { totalPages: 3 },
      artistInfo: { collections: [] },
      filteredCollection: null,
    });

    const result = parseShopNextData(html, "https://www.redbubble.com/people/ThreadQuirk/shop");

    expect(result.totalPages).toBe(3);
    expect(result.filteredCollection).toBeNull();
    expect(result.designs).toHaveLength(1);
    expect(result.designs[0]).toMatchObject({
      externalId: 173146884,
      title: "Handyman Repairman Problem Solver",
      keywords: "fix, repair",
      externalLink:
        "https://www.redbubble.com/i/hoodie/Handyman-Repairman-Problem-Solver-by-ThreadQuirk/173146884/lgcw",
      externalImageUrl: "https://ih1.redbubble.net/image.5909636486.6884/a.jpg",
      category: "hoodie",
      collection: "no_collection",
    });
  });

  it("prefers the product_close preview over other preview types", () => {
    const html = nextDataHtml({
      results: [
        {
          inventoryItem: {
            productPageUrl: "https://www.redbubble.com/i/mug/Foo/11111111",
            previewSet: {
              previews: [
                { previewTypeId: "alternate_product_close", url: "https://ih1.redbubble.net/alt.jpg" },
                { previewTypeId: "product_close", url: "https://ih1.redbubble.net/main.jpg" },
              ],
            },
            work: { id: "11111111", title: "Foo", tags: [] },
          },
        },
      ],
    });

    const result = parseShopNextData(html, "https://www.redbubble.com/people/x/shop");
    expect(result.designs[0].externalImageUrl).toBe("https://ih1.redbubble.net/main.jpg");
  });

  it("dedupes by externalId, keeping the first occurrence", () => {
    const html = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 22222222,
          title: "First",
          productPageUrl: "https://www.redbubble.com/i/t-shirt/First/22222222",
          imageUrl: "https://ih1.redbubble.net/first.jpg",
        }),
        rbResultEntry({
          workId: 22222222,
          title: "First (sticker)",
          productPageUrl: "https://www.redbubble.com/i/sticker/First/22222222",
          imageUrl: "https://ih1.redbubble.net/first-sticker.jpg",
        }),
      ],
    });

    const result = parseShopNextData(html, "https://www.redbubble.com/people/x/shop");
    expect(result.designs).toHaveLength(1);
    expect(result.designs[0].title).toBe("First");
  });

  it("skips entries missing id/title/link/image", () => {
    const html = nextDataHtml({
      results: [
        { inventoryItem: { productPageUrl: "", previewSet: { previews: [] }, work: { id: "1", title: "" } } },
      ],
    });
    const result = parseShopNextData(html, "https://www.redbubble.com/people/x/shop");
    expect(result.designs).toHaveLength(0);
  });

  it("maps artistInfo.collections and filteredCollection", () => {
    const html = nextDataHtml({
      results: [],
      artistInfo: { collections: [rbCollection(4167183, "States of the USA"), rbCollection(4167186, "Abstract Pattern")] },
      filteredCollection: { id: 4167183, title: "States of the USA", description: null, coverImageUrl: null },
    });
    const result = parseShopNextData(html, "https://www.redbubble.com/people/x/shop?collections=4167183");
    expect(result.collections).toEqual([
      { externalId: 4167183, title: "States of the USA", description: null, coverImageUrl: null },
      { externalId: 4167186, title: "Abstract Pattern", description: null, coverImageUrl: null },
    ]);
    expect(result.filteredCollection).toEqual({
      externalId: 4167183,
      title: "States of the USA",
      description: null,
      coverImageUrl: null,
    });
  });

  it("treats a null pagination object as a single page", () => {
    const html = nextDataHtml({ results: [], pagination: null });
    const result = parseShopNextData(html, "https://www.redbubble.com/people/x/shop");
    expect(result.totalPages).toBe(1);
  });

  it("throws a clear error when __NEXT_DATA__ is missing", () => {
    expect(() => parseShopNextData("<html><body>no next data here</body></html>", "https://x")).toThrow(
      /Redbubble page has no __NEXT_DATA__/,
    );
  });

  it("throws a clear error when __NEXT_DATA__ contains invalid JSON", () => {
    const html =
      '<html><head><script id="__NEXT_DATA__" type="application/json">{not json}</script></head></html>';
    expect(() => parseShopNextData(html, "https://x")).toThrow(/Redbubble page has no __NEXT_DATA__/);
  });
});

// ---------------------------------------------------------------------------
// Collections crawl + sync (cheerio mode, __NEXT_DATA__ driven)
// ---------------------------------------------------------------------------

describe("syncRedbubbleToSupabase — collections", () => {
  beforeEach(() => {
    calls = [];
    selectByIdResponses = [];
    selectByTitleResponses = [];
    insertResponses = [];
    upsertResponses = [];
    collectionsUpsertResponses = [];
    designIdLookupResponses = [];
    designCollectionsUpsertResponses = [];
    designCollectionsDeleteResponses = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
  const productB = "https://www.redbubble.com/i/sticker/Design-B-by-someartist/22222222.ST123";

  function mockShopWithCollections() {
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 11111111,
          title: "Design A",
          productPageUrl: productA,
          imageUrl: "https://ih1.redbubble.net/a.jpg",
        }),
        rbResultEntry({
          workId: 22222222,
          title: "Design B",
          productPageUrl: productB,
          imageUrl: "https://ih1.redbubble.net/b.jpg",
        }),
      ],
      pagination: { totalPages: 1 },
      artistInfo: { collections: [rbCollection(100, "Cats"), rbCollection(200, "Dogs")] },
      filteredCollection: null,
    });

    const catsPage = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 11111111,
          title: "Design A",
          productPageUrl: productA,
          imageUrl: "https://ih1.redbubble.net/a.jpg",
        }),
      ],
      pagination: null,
      artistInfo: { collections: [rbCollection(100, "Cats"), rbCollection(200, "Dogs")] },
      filteredCollection: rbCollection(100, "Cats"),
    });

    const dogsPage = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 11111111,
          title: "Design A",
          productPageUrl: productA,
          imageUrl: "https://ih1.redbubble.net/a.jpg",
        }),
        rbResultEntry({
          workId: 22222222,
          title: "Design B",
          productPageUrl: productB,
          imageUrl: "https://ih1.redbubble.net/b.jpg",
        }),
      ],
      pagination: null,
      artistInfo: { collections: [rbCollection(100, "Cats"), rbCollection(200, "Dogs")] },
      filteredCollection: rbCollection(200, "Dogs"),
    });

    return vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.startsWith(SHOP_URL) && u.includes("collections=100")) {
        return new Response(catsPage, { status: 200 });
      }
      if (u.startsWith(SHOP_URL) && u.includes("collections=200")) {
        return new Response(dogsPage, { status: 200 });
      }
      if (u.startsWith(SHOP_URL) && u.includes("page=1")) {
        return new Response(shopPage, { status: 200 });
      }
      if (u === productA) {
        return new Response(
          productHtml({
            name: "Design A",
            description: "Desc A",
            image: "https://ih1.redbubble.net/a.jpg",
            url: productA,
          }),
          { status: 200 },
        );
      }
      if (u === productB) {
        return new Response(
          productHtml({
            name: "Design B",
            description: "Desc B",
            image: "https://ih1.redbubble.net/b.jpg",
            url: productB,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${u}`);
    });
  }

  it("crawls collection-filtered pages, builds membership, and writes collections + links", async () => {
    vi.stubGlobal("fetch", mockShopWithCollections());

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(result.collections.found).toBe(2);
    expect(result.collections.upserted).toBe(2);
    // Design A: Cats + Dogs, Design B: Dogs only.
    expect(result.collections.links).toBe(3);

    const collectionsUpserts = forTable(upsertCalls(), "collections");
    expect(collectionsUpserts).toHaveLength(1);
    expect(collectionsUpserts[0].rows.map((r) => r.title)).toEqual(["Cats", "Dogs"]);

    const linkUpserts = forTable(upsertCalls(), "design_collections");
    expect(linkUpserts).toHaveLength(1);
    expect(linkUpserts[0].rows).toHaveLength(3);
    expect(linkUpserts[0].opts).toMatchObject({ onConflict: "designId,collectionId", ignoreDuplicates: true });

    // Deletes: one "not a Cats member" delete for design B, plus one "not in any current
    // collection" catch-all for the chunk. Dogs has no non-member in this chunk, so it
    // issues no delete (see the request-count guard tested separately).
    const linkDeletes = forTable(deleteCalls(), "design_collections");
    expect(linkDeletes).toHaveLength(2);
    const catsStaleDelete = linkDeletes.find((d) =>
      d.filters.some((f) => f.op === "eq" && f.col === "collectionId"),
    );
    expect(catsStaleDelete?.filters).toEqual(
      expect.arrayContaining([{ op: "eq", col: "collectionId", val: "col-id-100" }]),
    );
    const catchAllDelete = linkDeletes.find((d) => d.filters.some((f) => f.op === "not-in"));
    expect(catchAllDelete).toBeDefined();

    const designInserts = forTable(insertCalls(), "designs");
    expect(designInserts).toHaveLength(1);
    // `collections` must never be sent as a column on the `designs` table.
    for (const row of designInserts[0].rows) {
      expect(row).not.toHaveProperty("collections");
    }
    const rowA = designInserts[0].rows.find((r) => r.externalId === 11111111);
    expect(rowA?.collection).toBe("Cats");
  });

  it("requests collection-filtered pages with a stable sortOrder=recent", async () => {
    const fetchMock = mockShopWithCollections();
    vi.stubGlobal("fetch", fetchMock);

    await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const collectionUrls = fetchMock.mock.calls
      .map(([url]) => url.toString())
      .filter((u) => u.startsWith(SHOP_URL) && u.includes("collections="));
    expect(collectionUrls.length).toBeGreaterThan(0);
    for (const u of collectionUrls) {
      expect(u).toContain("sortOrder=recent");
    }
  });

  it("does not issue a stale-link delete for a collection with no non-member designs in the chunk", async () => {
    vi.stubGlobal("fetch", mockShopWithCollections());

    await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const linkDeletes = forTable(deleteCalls(), "design_collections");
    // Dogs (both A and B are members) must not get a per-collection stale delete.
    const dogsStaleDelete = linkDeletes.find((d) =>
      d.filters.some((f) => f.op === "eq" && f.col === "collectionId" && f.val === "col-id-200"),
    );
    expect(dogsStaleDelete).toBeUndefined();
  });

  it("dedupes membership when a design appears on more than one page of the same collection", async () => {
    const catsPageOne = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 11111111,
          title: "Design A",
          productPageUrl: productA,
          imageUrl: "https://ih1.redbubble.net/a.jpg",
        }),
      ],
      pagination: { totalPages: 2 },
      artistInfo: { collections: [rbCollection(100, "Cats")] },
      filteredCollection: rbCollection(100, "Cats"),
    });
    const catsPageTwo = nextDataHtml({
      results: [
        // Same design repeated on page 2 (paging overlap) — must not double the link.
        rbResultEntry({
          workId: 11111111,
          title: "Design A",
          productPageUrl: productA,
          imageUrl: "https://ih1.redbubble.net/a.jpg",
        }),
      ],
      pagination: { totalPages: 2 },
      artistInfo: { collections: [rbCollection(100, "Cats")] },
      filteredCollection: rbCollection(100, "Cats"),
    });
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 11111111,
          title: "Design A",
          productPageUrl: productA,
          imageUrl: "https://ih1.redbubble.net/a.jpg",
        }),
      ],
      pagination: { totalPages: 1 },
      artistInfo: { collections: [rbCollection(100, "Cats")] },
      filteredCollection: null,
    });

    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.startsWith(SHOP_URL) && u.includes("collections=100") && u.includes("page=2")) {
        return new Response(catsPageTwo, { status: 200 });
      }
      if (u.startsWith(SHOP_URL) && u.includes("collections=100")) {
        return new Response(catsPageOne, { status: 200 });
      }
      if (u.startsWith(SHOP_URL) && u.includes("page=1")) {
        return new Response(shopPage, { status: 200 });
      }
      if (u === productA) {
        return new Response(
          productHtml({
            name: "Design A",
            description: "Desc A",
            image: "https://ih1.redbubble.net/a.jpg",
            url: productA,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL, maxPages: 3 }));

    expect(result.collections.links).toBe(1);
    const linkUpserts = forTable(upsertCalls(), "design_collections");
    expect(linkUpserts).toHaveLength(1);
    expect(linkUpserts[0].rows).toHaveLength(1);
  });

  it("overwrites the collection field on an existing row when collectionsComplete", async () => {
    vi.stubGlobal("fetch", mockShopWithCollections());
    selectByIdResponses = [
      {
        data: [existingRow({ externalId: 11111111, title: "Design A", collection: "Old Collection" })],
        error: null,
      },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const designUpserts = forTable(upsertCalls(), "designs");
    expect(designUpserts).toHaveLength(1);
    const rowA = designUpserts[0].rows.find((r) => r.externalId === 11111111);
    expect(rowA?.collection).toBe("Cats");
    expect(result.updated).toBe(1);
  });

  it("dry-run: makes no writes and returns a collections + links plan", async () => {
    vi.stubGlobal("fetch", mockShopWithCollections());

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL, dryRun: true }));

    expect(insertCalls()).toHaveLength(0);
    expect(upsertCalls()).toHaveLength(0);
    expect(deleteCalls()).toHaveLength(0);
    expect(result.dryRun).toBe(true);
    expect(result.plan?.collections).toHaveLength(2);
    expect(result.plan?.links).toEqual(
      expect.arrayContaining([
        { externalId: 11111111, collections: [100, 200] },
        { externalId: 22222222, collections: [200] },
      ]),
    );
  });

  it("collectionsComplete=false: skips collections/links writes, keeps fill-if-empty rule, and warns", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.startsWith(SHOP_URL) && u.includes("collections=100")) {
        throw new Error("network error fetching Cats collection");
      }
      const base = mockShopWithCollections();
      return base(u);
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [
      {
        data: [existingRow({ externalId: 11111111, title: "Design A", collection: "Old Collection" })],
        error: null,
      },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(forTable(upsertCalls(), "collections")).toHaveLength(0);
    expect(deleteCalls()).toHaveLength(0);
    expect(forTable(upsertCalls(), "design_collections")).toHaveLength(0);
    expect(result.collections.upserted).toBe(0);
    expect(result.collections.links).toBe(0);
    expect(result.warnings.some((w) => /Collections crawl incomplete/.test(w))).toBe(true);

    // Fill-if-empty rule still applies for `collection` on the existing row: since the
    // existing value isn't empty/default it must be kept as-is.
    const designUpserts = forTable(upsertCalls(), "designs");
    const rowA = designUpserts[0].rows.find((r) => r.externalId === 11111111);
    expect(rowA?.collection).toBe("Old Collection");
  });

  it("truncated collection (totalPages > maxPages): collectionsComplete=false, no collections/links writes, collection field not overwritten", async () => {
    const catsPageTruncated = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 11111111,
          title: "Design A",
          productPageUrl: productA,
          imageUrl: "https://ih1.redbubble.net/a.jpg",
        }),
      ],
      // totalPages=2 but maxPages below is 1, so only page 1 is fetched.
      pagination: { totalPages: 2 },
      artistInfo: { collections: [rbCollection(100, "Cats"), rbCollection(200, "Dogs")] },
      filteredCollection: rbCollection(100, "Cats"),
    });
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.startsWith(SHOP_URL) && u.includes("collections=100")) {
        return new Response(catsPageTruncated, { status: 200 });
      }
      const base = mockShopWithCollections();
      return base(u);
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [
      {
        data: [existingRow({ externalId: 11111111, title: "Design A", collection: "Old Collection" })],
        error: null,
      },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL, maxPages: 1 }));

    expect(result.warnings.some((w) => /Collection "Cats" truncated at maxPages=1 of totalPages=2/.test(w))).toBe(
      true,
    );
    expect(forTable(upsertCalls(), "collections")).toHaveLength(0);
    expect(forTable(upsertCalls(), "design_collections")).toHaveLength(0);
    expect(deleteCalls()).toHaveLength(0);
    expect(result.collections.upserted).toBe(0);
    expect(result.collections.links).toBe(0);

    const designUpserts = forTable(upsertCalls(), "designs");
    const rowA = designUpserts[0].rows.find((r) => r.externalId === 11111111);
    expect(rowA?.collection).toBe("Old Collection");
  });

  it("link upsert failure: issues no deletes for that chunk and counts the error", async () => {
    vi.stubGlobal("fetch", mockShopWithCollections());
    designCollectionsUpsertResponses = [{ data: null, error: { message: "link upsert failed" } }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(forTable(upsertCalls(), "design_collections")).toHaveLength(1);
    expect(forTable(deleteCalls(), "design_collections")).toHaveLength(0);
    expect(result.collections.links).toBe(0);
    expect(result.errorMessages).toContain("link upsert failed");
    expect(result.errors).toBeGreaterThan(0);
  });

  it("collections upsert failure: skips the whole design_collections phase (no upserts, no deletes) and warns", async () => {
    vi.stubGlobal("fetch", mockShopWithCollections());
    collectionsUpsertResponses = [{ data: null, error: { message: "collections upsert failed" } }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(forTable(upsertCalls(), "design_collections")).toHaveLength(0);
    expect(forTable(deleteCalls(), "design_collections")).toHaveLength(0);
    expect(result.collections.links).toBe(0);
    expect(result.errorMessages).toContain("collections upsert failed");
    expect(result.warnings).toContain("Skipped collection links: collections upsert failed");
  });

  it("issues stale-link deletes only after a successful upsert (call order)", async () => {
    vi.stubGlobal("fetch", mockShopWithCollections());

    await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    // `calls` is a single chronological log across every table/operation.
    const linkUpsertIndex = calls.findIndex((c) => c.type === "upsert" && c.table === "design_collections");
    const linkDeleteIndexes = calls
      .map((c, i) => (c.type === "delete" && c.table === "design_collections" ? i : -1))
      .filter((i) => i !== -1);
    expect(linkUpsertIndex).toBeGreaterThanOrEqual(0);
    expect(linkDeleteIndexes.length).toBeGreaterThan(0);
    for (const deleteIndex of linkDeleteIndexes) {
      expect(deleteIndex).toBeGreaterThan(linkUpsertIndex);
    }
  });
});
