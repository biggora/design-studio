import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeShopUrl,
  extractExternalIdFromUrl,
  RequestPacer,
  syncRedbubbleToSupabase,
  parseShopNextData,
  buildArtworkImageUrl,
  extractClassicTeeMockupUrl,
} from "@/lib/sync/redbubble";

// Fixture work ids used throughout: the mockup extractor keys off the last 4 digits of the
// work id, so every image id below ends in the matching work id's last 4 digits.
const WHITE_TOKEN = "fafafa:ca443f4786";
const BLACK_TOKEN = "101010:01c5ca27c6";

// Builds a fragment matching the shape of a real /shop/ap/<workId> page's Apollo state entry
// for a Classic T-Shirt preview: `https://<host>/image.<A>.<last4>/ssrco,classic_tee,<variant>,<colorToken>,front,...`.
function shopApMockupHtml(opts: {
  workId: number;
  imageA: string;
  colorToken: string;
  host?: string;
  variant?: string;
  encodeSlashes?: boolean;
}): string {
  const host = opts.host ?? "ih1.redbubble.net";
  const variant = opts.variant ?? "mens_02";
  const last4 = String(opts.workId).slice(-4);
  const url = `https://${host}/image.${opts.imageA}.${last4}/ssrco,classic_tee,${variant},${opts.colorToken},front,square_close_portrait,x1000.u1.jpg`;
  const encoded = opts.encodeSlashes ? url.replace(/\//g, "{{%2F}}") : url;
  return `<!doctype html><html><body><script>{"preview":"${encoded.replace(
    /"/g,
    '\\"',
  )}"}</script></body></html>`;
}

function mockupUrl(opts: { host?: string; imageA: string; last4: string; colorToken: string }): string {
  const host = opts.host ?? "ih1.redbubble.net";
  return `https://${host}/image.${opts.imageA}.${opts.last4}/ssrco,classic_tee,flatlay,${opts.colorToken},front,tall_portrait,x1000.jpg`;
}

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
// buildArtworkImageUrl
// ---------------------------------------------------------------------------

describe("buildArtworkImageUrl", () => {
  it("rewrites a preview URL to the flat, full-artwork variant on the same host/image id", () => {
    expect(
      buildArtworkImageUrl(
        "https://ih1.redbubble.net/image.5909636501.6884/ssrco,lightweight_hoodie,mens,101010:01c5ca27c6,front_alt,square_product,600x600.jpg",
      ),
    ).toBe("https://ih1.redbubble.net/image.5909636501.6884/flat,500x,075,f.u2.jpg");
  });

  it("returns the input unchanged when it isn't a recognizable Redbubble image URL", () => {
    expect(buildArtworkImageUrl("https://example.com/not-an-image")).toBe(
      "https://example.com/not-an-image",
    );
  });
});

// ---------------------------------------------------------------------------
// extractClassicTeeMockupUrl
// ---------------------------------------------------------------------------

describe("extractClassicTeeMockupUrl", () => {
  it("extracts a white Classic T-Shirt mockup (fafafa) for the matching work id", () => {
    const html = shopApMockupHtml({ workId: 165517994, imageA: "5674585231", colorToken: WHITE_TOKEN });
    expect(extractClassicTeeMockupUrl(html, 165517994)).toBe(
      mockupUrl({ imageA: "5674585231", last4: "7994", colorToken: WHITE_TOKEN }),
    );
  });

  it("extracts a black Classic T-Shirt mockup (101010) for the matching work id", () => {
    const html = shopApMockupHtml({ workId: 173148090, imageA: "6240296681", colorToken: BLACK_TOKEN });
    expect(extractClassicTeeMockupUrl(html, 173148090)).toBe(
      mockupUrl({ imageA: "6240296681", last4: "8090", colorToken: BLACK_TOKEN }),
    );
  });

  it("decodes {{%2F}}-encoded slashes before matching", () => {
    const html = shopApMockupHtml({
      workId: 165517994,
      imageA: "5674585231",
      colorToken: WHITE_TOKEN,
      encodeSlashes: true,
    });
    expect(html).toContain("{{%2F}}");
    expect(extractClassicTeeMockupUrl(html, 165517994)).toBe(
      mockupUrl({ imageA: "5674585231", last4: "7994", colorToken: WHITE_TOKEN }),
    );
  });

  it("ignores a related work's preview (different image-id suffix) and picks this work's own", () => {
    const relatedWorkFragment = shopApMockupHtml({
      workId: 199999999, // last4 "9999" — different from the target work below
      imageA: "1111111111",
      colorToken: BLACK_TOKEN,
    });
    const ownWorkFragment = shopApMockupHtml({
      workId: 165517994,
      imageA: "5674585231",
      colorToken: WHITE_TOKEN,
    });
    const html = `<html><body>${relatedWorkFragment}${ownWorkFragment}</body></html>`;
    expect(extractClassicTeeMockupUrl(html, 165517994)).toBe(
      mockupUrl({ imageA: "5674585231", last4: "7994", colorToken: WHITE_TOKEN }),
    );
  });

  it("returns null when no matching Classic T-Shirt preview is found", () => {
    expect(extractClassicTeeMockupUrl("<html><body>no previews here</body></html>", 165517994)).toBeNull();
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
  | { type: "select-like"; table: string; col: string; pattern: string }
  | { type: "insert"; table: string; rows: Row[] }
  | { type: "update"; table: string; changes: Row; filters: { col: string; val: unknown }[] }
  | { type: "upsert"; table: string; rows: Row[]; opts: Record<string, unknown> }
  | { type: "delete"; table: string; filters: DeleteFilter[] };

let calls: Call[] = [];
let selectByIdResponses: MockResponse[] = [];
let selectByTitleResponses: MockResponse[] = [];
let insertResponses: MockResponse[] = [];
let updateResponses: { error: { message: string } | null }[] = [];
let upsertResponses: MockResponse[] = [];
let collectionsUpsertResponses: MockResponse[] = [];
let designIdLookupResponses: MockResponse[] = [];
let designCollectionsUpsertResponses: MockResponse[] = [];
let designCollectionsDeleteResponses: MockResponse[] = [];
let slugLikeResponses: MockResponse[] = [];

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
        like: (col: string, pattern: string) => {
          calls.push({ type: "select-like", table, col, pattern });
          const queued = slugLikeResponses.shift();
          return Promise.resolve(queued || { data: [], error: null });
        },
      }),
      insert: (rows: Row[]) => ({
        select: () => {
          calls.push({ type: "insert", table, rows });
          return nextOr(insertResponses, rows);
        },
      }),
      update: (changes: Row) => ({
        eq: (col: string, val: unknown) => {
          calls.push({ type: "update", table, changes, filters: [{ col, val }] });
          const queued = updateResponses.shift();
          return Promise.resolve(queued || { error: null });
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

// Builds a /shop/ap/<workId> page fixture with a description meta tag and, optionally, a
// Classic T-Shirt mockup fragment (see shopApMockupHtml) for the given work.
function shopApHtml(
  description: string,
  mockup?: { workId: number; imageA: string; colorToken: string },
): string {
  const mockupFragment = mockup ? shopApMockupHtml(mockup).match(/<script>.*<\/script>/)?.[0] ?? "" : "";
  return `<!doctype html><html><head><meta name="description" content="${description.replace(/"/g, "&quot;")}"></head><body>${mockupFragment}</body></html>`;
}

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

function updateCalls(): Extract<Call, { type: "update" }>[] {
  return calls.filter((c): c is Extract<Call, { type: "update" }> => c.type === "update");
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

function selectLikeCalls(): Extract<Call, { type: "select-like" }>[] {
  return calls.filter((c): c is Extract<Call, { type: "select-like" }> => c.type === "select-like");
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

function mockShop(shopPageHtml: string, shopApByWorkId: Record<number, string>) {
  return vi.fn(async (url: string) => {
    const u = url.toString();
    if (u.startsWith(SHOP_URL) && u.includes("page=1")) {
      return new Response(shopPageHtml, { status: 200 });
    }
    if (u.startsWith(SHOP_URL) && u.includes("page=2")) {
      return new Response(nextDataHtml({ results: [] }), { status: 200 });
    }
    for (const [workId, html] of Object.entries(shopApByWorkId)) {
      if (u === `https://www.redbubble.com/shop/ap/${workId}`) {
        return new Response(html, { status: 200 });
      }
    }
    throw new Error(`unexpected fetch: ${u}`);
  });
}

function existingRow(overrides: Partial<Row> = {}) {
  return {
    id: "existing-uuid-1",
    externalId: 11111111,
    ...overrides,
  };
}

describe("syncRedbubbleToSupabase", () => {
  beforeEach(() => {
    calls = [];
    selectByIdResponses = [];
    selectByTitleResponses = [];
    insertResponses = [];
    updateResponses = [];
    upsertResponses = [];
    collectionsUpsertResponses = [];
    designIdLookupResponses = [];
    designCollectionsUpsertResponses = [];
    designCollectionsDeleteResponses = [];
    slugLikeResponses = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("inserts a brand new design in the same format as existing production rows", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 11111111,
          title: "Design A",
          tags: ["fix", "repair"],
          productPageUrl: productA,
          imageUrl: "https://ih1.redbubble.net/image.5909636501.6884/st,small,507x507-pad,600x600,f8f8f8.jpg",
        }),
      ],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, {
      11111111: shopApHtml("A hand-drawn design.\n\nPrinted on demand.", {
        workId: 11111111,
        imageA: "5674585231",
        colorToken: WHITE_TOKEN,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const inserts = insertCalls();
    const upserts = upsertCalls();
    expect(inserts).toHaveLength(1);
    expect(upserts).toHaveLength(0);
    expect(inserts[0].rows).toHaveLength(1);
    const row = inserts[0].rows[0] as Row;

    expect(row.externalId).toBe(11111111);
    expect(row.title).toBe("Design A");
    expect(row.externalLink).toBe("https://www.redbubble.com/shop/ap/11111111");
    // Built from the mockup upload's own image id (5674585231.1111), not the listing preview's
    // (5909636501.6884) — Redbubble stores several uploads per work, and the mockup upload is
    // always the correct tee artwork.
    expect(row.externalImageUrl).toBe(
      "https://ih1.redbubble.net/image.5674585231.1111/raf,750x,075,f,fafafa:ca443f4786.jpg",
    );
    expect(row.imageName).toBeNull();
    expect(row.category).toBe("no_category");
    expect(row.collection).toBe("no_collection");
    expect(row.keywords).toBe("fix, repair");
    expect(row.backgroundColor).toBe("#fafafa");
    expect(row.backgroundColors).toBe("");
    expect(row.shared).toBe(false);
    expect(row.props).toEqual({
      mockup_tshirt: mockupUrl({ imageA: "5674585231", last4: "1111", colorToken: WHITE_TOKEN }),
    });
    expect(row.description).toBe("A hand-drawn design.\n\nPrinted on demand.");
    expect(row.slug).toBe("design-a");
    expect(typeof row.updatedAt).toBe("string");

    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.dryRun).toBe(false);
  });

  it("appends -2 when the slug base is already taken in the database", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg" })],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, { 11111111: shopApHtml("Desc A") });
    vi.stubGlobal("fetch", fetchMock);

    slugLikeResponses = [{ data: [{ slug: "design-a" }], error: null }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const likes = selectLikeCalls();
    expect(likes).toHaveLength(1);
    expect(likes[0].pattern).toBe("design-a%");
    const inserts = insertCalls();
    expect(inserts[0].rows[0].slug).toBe("design-a-2");
    expect(result.inserted).toBe(1);
  });

  it("assigns distinct slugs to two new titles sharing a base in one batch, with a single LIKE query", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/X-by-someartist/91111111.FB110";
    const productB = "https://www.redbubble.com/i/sticker/X-by-someartist/92222222.ST123";
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({ workId: 91111111, title: "X!", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.911.1/a.jpg" }),
        rbResultEntry({ workId: 92222222, title: "X", productPageUrl: productB, imageUrl: "https://ih1.redbubble.net/image.922.1/b.jpg" }),
      ],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, {
      91111111: shopApHtml("Desc X1"),
      92222222: shopApHtml("Desc X2"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const likes = selectLikeCalls();
    expect(likes).toHaveLength(1);
    expect(likes[0].pattern).toBe("x%");
    const inserts = insertCalls();
    expect(inserts[0].rows).toHaveLength(2);
    const slugs = (inserts[0].rows as Row[]).map((r) => r.slug);
    expect(slugs.sort()).toEqual(["x", "x-2"]);
    expect(result.inserted).toBe(2);
  });

  it("drops rows whose slug base lookup fails and records the error, without inserting them", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg" })],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, {});
    vi.stubGlobal("fetch", fetchMock);

    slugLikeResponses = [{ data: null, error: { message: "slug lookup failed" } }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(insertCalls()).toHaveLength(0);
    expect(result.inserted).toBe(0);
    expect(result.errors).toBeGreaterThan(0);
    expect(result.errorMessages).toContain("slug lookup failed");
  });

  it("falls back to design-<externalId> for a title with no ASCII characters", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-by-someartist/93333333.FB110";
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 93333333, title: "Кот", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.933.1/a.jpg" })],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, { 93333333: shopApHtml("Desc") });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const inserts = insertCalls();
    expect(inserts[0].rows[0].slug).toBe("design-93333333");
    expect(result.inserted).toBe(1);
  });

  it("never sends slug on an update to an existing row", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/55555555.FB110";
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 55555555, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.555.1/a.jpg" })],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, {
      55555555: shopApHtml("Desc A", { workId: 55555555, imageA: "555", colorToken: WHITE_TOKEN }),
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: [existingRow({ externalId: 55555555 })], error: null }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].changes)).not.toContain("slug");
    expect(result.updated).toBe(1);
  });

  it("fetches /shop/ap/<workId> for a new design's description, and never re-fetches an existing design that already has its mockup", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const productB = "https://www.redbubble.com/i/sticker/Design-B-by-someartist/22222222.ST123";
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg" }),
        rbResultEntry({ workId: 22222222, title: "Design B", productPageUrl: productB, imageUrl: "https://ih1.redbubble.net/image.222.2/b.jpg" }),
      ],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, {
      22222222: shopApHtml("Description for B"),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Design A already exists in the DB and already has a mockup — no /shop/ap fetch at all
    // for it (a fetch attempt would throw here, since 11111111 has no mock registered above).
    selectByIdResponses = [
      {
        data: [
          {
            externalId: 11111111,
            props: { mockup_tshirt: "https://existing.example/already-there.jpg" },
          },
        ],
        error: null,
      },
    ];

    await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const fetchedUrls = fetchMock.mock.calls.map(([url]) => url.toString());
    expect(fetchedUrls).not.toContain("https://www.redbubble.com/shop/ap/11111111");
    expect(fetchedUrls).toContain("https://www.redbubble.com/shop/ap/22222222");

    const inserts = insertCalls();
    expect(inserts[0].rows[0].description).toBe("Description for B");
  });

  it("description fetch failure: the new row is still inserted with an empty description and the error is recorded", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg" }),
      ],
      pagination: { totalPages: 1 },
    });
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.startsWith(SHOP_URL) && u.includes("page=1")) return new Response(shopPage, { status: 200 });
      if (u.startsWith(SHOP_URL) && u.includes("page=2")) return new Response(nextDataHtml({ results: [] }), { status: 200 });
      if (u === "https://www.redbubble.com/shop/ap/11111111") {
        throw new Error("network error");
      }
      throw new Error(`unexpected fetch: ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const inserts = insertCalls();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows[0].description).toBe("");
    expect(result.inserted).toBe(1);
    expect(result.errorMessages.some((m) => m.includes("Failed to fetch /shop/ap/11111111"))).toBe(true);
    expect(result.errors).toBeGreaterThan(0);
  });

  it("requests shop listing pages with a stable sortOrder=recent", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg" })],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, { 11111111: shopApHtml("Desc A") });
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

  it("updates an existing row by sending externalId, collection, props, and updatedAt when a mockup needs backfilling", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg" })],
      pagination: { totalPages: 1 },
      artistInfo: { collections: [rbCollection(100, "Cats")] },
    });
    const fetchMock = mockShop(shopPage, {});
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: [existingRow()], error: null }];

    // No collections crawl page beyond the shop listing itself in this test — the shop page
    // declares a collection but the collection-filtered page fetch will fail (unmocked),
    // marking collectionsComplete=false, so use a simpler shop page with no collections
    // to exercise the "collectionsComplete=true, collection stays no_collection" path.
    const shopPageNoCollections = nextDataHtml({
      results: [rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg" })],
      pagination: { totalPages: 1 },
    });
    const simpleFetchMock = mockShop(shopPageNoCollections, {
      11111111: shopApHtml("Desc A", { workId: 11111111, imageA: "111", colorToken: BLACK_TOKEN }),
    });
    vi.stubGlobal("fetch", simpleFetchMock);

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const updates = updateCalls();
    const inserts = insertCalls();
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("designs");
    expect(Object.keys(updates[0].changes).sort()).toEqual(["collection", "props", "updatedAt"]);
    expect(updates[0].changes.collection).toBe("no_collection");
    // The DB row (mocked via existingRow()) has no stored props, so a missing mockup is
    // backfilled from a fresh /shop/ap/<workId> fetch, alongside the collection sync.
    expect(updates[0].changes.props).toEqual({
      mockup_tshirt: mockupUrl({ imageA: "111", last4: "1111", colorToken: BLACK_TOKEN }),
    });
    expect(typeof updates[0].changes.updatedAt).toBe("string");
    expect(updates[0].filters).toEqual([{ col: "externalId", val: 11111111 }]);

    // The /shop/ap/<workId> page is fetched for the mockup backfill (but its description is
    // discarded — existing rows never have their description overwritten).
    const fetchedUrls = simpleFetchMock.mock.calls.map(([url]) => url.toString());
    expect(fetchedUrls).toContain("https://www.redbubble.com/shop/ap/11111111");

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(1);
  });

  it("collectionsComplete=false: leaves collection untouched but still backfills a missing mockup", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg" })],
      pagination: { totalPages: 1 },
      artistInfo: { collections: [rbCollection(100, "Cats")] },
    });
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.startsWith(SHOP_URL) && u.includes("collections=100")) {
        throw new Error("network error fetching Cats collection");
      }
      if (u.startsWith(SHOP_URL) && u.includes("page=1")) return new Response(shopPage, { status: 200 });
      if (u.startsWith(SHOP_URL) && u.includes("page=2")) return new Response(nextDataHtml({ results: [] }), { status: 200 });
      if (u === "https://www.redbubble.com/shop/ap/11111111") {
        return new Response(
          shopApHtml("Desc A", { workId: 11111111, imageA: "111", colorToken: BLACK_TOKEN }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: [existingRow()], error: null }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(insertCalls()).toHaveLength(0);
    expect(result.inserted).toBe(0);

    // Collection sync is skipped (collectionsComplete=false), but a missing mockup_tshirt is
    // backfilled independently, so a props-only update is still sent.
    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].changes).sort()).toEqual(["props", "updatedAt"]);
    expect(updates[0].changes.props).toEqual({
      mockup_tshirt: mockupUrl({ imageA: "111", last4: "1111", colorToken: BLACK_TOKEN }),
    });
    expect(result.updated).toBe(1);
    expect(result.warnings.some((w) => /left unchanged/.test(w))).toBe(false);
  });

  it("skips the second row of an in-batch title collision and records a warning", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Same-Title-by-someartist/33333333.FB110";
    const productB = "https://www.redbubble.com/i/sticker/Same-Title-by-someartist/44444444.ST123";
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({ workId: 33333333, title: "Same Title", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.333.1/a.jpg" }),
        rbResultEntry({ workId: 44444444, title: "Same Title", productPageUrl: productB, imageUrl: "https://ih1.redbubble.net/image.444.1/b.jpg" }),
      ],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, { 33333333: shopApHtml("Desc A") });
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
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 55555555, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.555.1/a.jpg" })],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, {});
    vi.stubGlobal("fetch", fetchMock);

    selectByTitleResponses = [
      { data: [{ externalId: 99999999, title: "Design A" }], error: null },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(insertCalls()).toHaveLength(0);
    expect(updateCalls()).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(
      result.warnings.some((w) => w.includes("55555555") && w.includes("99999999")),
    ).toBe(true);
  });

  it("dryRun: true makes no write calls and returns the would-be plan with {externalId, collection} for updates", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";
    const productB = "https://www.redbubble.com/i/sticker/Design-B-by-someartist/22222222.ST123";
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg" }),
        rbResultEntry({ workId: 22222222, title: "Design B", productPageUrl: productB, imageUrl: "https://ih1.redbubble.net/image.222.1/b.jpg" }),
      ],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, {
      11111111: shopApHtml("Desc A"),
      22222222: shopApHtml("Desc B", { workId: 22222222, imageA: "222", colorToken: BLACK_TOKEN }),
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: [existingRow({ externalId: 22222222 })], error: null }];

    const result = await syncRedbubbleToSupabase(
      baseOptions({ shopUrl: SHOP_URL, dryRun: true }),
    );

    expect(insertCalls()).toHaveLength(0);
    expect(updateCalls()).toHaveLength(0);
    expect(upsertCalls()).toHaveLength(0);
    expect(result.dryRun).toBe(true);
    expect(result.plan?.insert).toHaveLength(1);
    expect((result.plan?.insert[0] as Row).slug).toBe("design-a");
    expect(result.plan?.update).toEqual([
      {
        externalId: 22222222,
        collection: "no_collection",
        props: {
          mockup_tshirt: mockupUrl({ imageA: "222", last4: "2222", colorToken: BLACK_TOKEN }),
        },
      },
    ]);
    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(1);
  });

  it("continues with the next insert chunk when one chunk of >100 new rows fails", async () => {
    const count = 101;
    const results: unknown[] = [];
    const shopApByWorkId: Record<number, string> = {};
    for (let i = 0; i < count; i += 1) {
      const id = 90000000 + i;
      const url = `https://www.redbubble.com/i/t-shirt/Title-${i}-by-someartist/${id}.FB110`;
      results.push(
        rbResultEntry({ workId: id, title: `Title ${i}`, productPageUrl: url, imageUrl: `https://ih1.redbubble.net/image.${id}.1/a.jpg` }),
      );
      shopApByWorkId[id] = shopApHtml(`Desc ${i}`);
    }
    const shopPage = nextDataHtml({ results, pagination: { totalPages: 1 } });
    const fetchMock = mockShop(shopPage, shopApByWorkId);
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

  it("reports the SELECT error and makes no insert/update calls", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/55555555.FB110";
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 55555555, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.555.1/a.jpg" })],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, {});
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: null, error: { message: "select failed" } }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(insertCalls()).toHaveLength(0);
    expect(updateCalls()).toHaveLength(0);
    expect(result.errors).toBe(1);
    expect(result.errorMessages).toContain("select failed");
  });

  it("escapes quotes/commas in a title for the PostgREST `in` filter and still syncs the row", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Weird-Title-by-someartist/12121212.FB110";
    const weirdTitle = `24", 36" Print, Set of 2`;
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 12121212, title: weirdTitle, productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.121.1/a.jpg" })],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, { 12121212: shopApHtml("Desc") });
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
    const results: unknown[] = [];
    const shopApByWorkId: Record<number, string> = {};
    for (let i = 0; i < count; i += 1) {
      const id = 80000000 + i;
      const url = `https://www.redbubble.com/i/t-shirt/Title-${i}-by-someartist/${id}.FB110`;
      results.push(
        rbResultEntry({ workId: id, title: `Title ${i}`, productPageUrl: url, imageUrl: `https://ih1.redbubble.net/image.${id}.1/a.jpg` }),
      );
      shopApByWorkId[id] = shopApHtml(`Desc ${i}`);
    }
    const shopPage = nextDataHtml({ results, pagination: { totalPages: 1 } });
    const fetchMock = mockShop(shopPage, shopApByWorkId);
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
    const results: unknown[] = [];
    const shopApByWorkId: Record<number, string> = {};
    for (let i = 0; i < count; i += 1) {
      const id = 70000000 + i;
      const url = `https://www.redbubble.com/i/t-shirt/Title-${i}-by-someartist/${id}.FB110`;
      results.push(
        rbResultEntry({ workId: id, title: `Title ${i}`, productPageUrl: url, imageUrl: `https://ih1.redbubble.net/image.${id}.1/a.jpg` }),
      );
      shopApByWorkId[id] = shopApHtml(`Desc ${i}`);
    }
    const shopPage = nextDataHtml({ results, pagination: { totalPages: 1 } });
    const fetchMock = mockShop(shopPage, shopApByWorkId);
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
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({ workId: 61111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.611.1/a.jpg" }),
        rbResultEntry({ workId: 62222222, title: "Design B", productPageUrl: productB, imageUrl: "https://ih1.redbubble.net/image.622.1/b.jpg" }),
        rbResultEntry({ workId: 63333333, title: "Design C", productPageUrl: productC, imageUrl: "https://ih1.redbubble.net/image.633.1/c.jpg" }),
      ],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, {});
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: null, error: { message: "id lookup failed" } }];
    selectByTitleResponses = [{ data: null, error: { message: "title lookup failed" } }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(insertCalls()).toHaveLength(0);
    expect(updateCalls()).toHaveLength(0);
    // 3 rows failed both lookups: must be counted once each, not once per failing lookup.
    expect(result.errors).toBe(3);
    expect(result.errorMessages).toContain("id lookup failed");
    expect(result.errorMessages).toContain("title lookup failed");
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
  });

  it("collects the error and does not throw when the insert fails (e.g. RLS violation)", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/55555555.FB110";
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 55555555, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.555.1/a.jpg" })],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, { 55555555: shopApHtml("Desc A") });
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

  it("collects the error and does not throw when the update fails", async () => {
    const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/55555555.FB110";
    const shopPage = nextDataHtml({
      results: [rbResultEntry({ workId: 55555555, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.555.1/a.jpg" })],
      pagination: { totalPages: 1 },
    });
    const fetchMock = mockShop(shopPage, {
      55555555: shopApHtml("Desc A", { workId: 55555555, imageA: "555", colorToken: WHITE_TOKEN }),
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: [existingRow({ externalId: 55555555 })], error: null }];
    updateResponses = [{ error: { message: "update failed" } }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(updateCalls()).toHaveLength(1);
    expect(result.errors).toBe(1);
    expect(result.errorMessages).toContain("update failed");
    expect(result.updated).toBe(0);
  });

  it("does not call insert/update and reports nothing when the shop page has 0 designs", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.startsWith(SHOP_URL)) {
        return new Response(nextDataHtml({ results: [] }), { status: 200 });
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
  });
});

// ---------------------------------------------------------------------------
// parseShopNextData
// ---------------------------------------------------------------------------

describe("parseShopNextData", () => {
  it("maps results[].inventoryItem into DesignRecord fields matching the existing-row format", () => {
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

    const result = parseShopNextData(html);

    expect(result.totalPages).toBe(3);
    expect(result.filteredCollection).toBeNull();
    expect(result.designs).toHaveLength(1);
    expect(result.designs[0]).toMatchObject({
      externalId: 173146884,
      title: "Handyman Repairman Problem Solver",
      keywords: "fix, repair",
      externalLink: "https://www.redbubble.com/shop/ap/173146884",
      externalImageUrl: "https://ih1.redbubble.net/image.5909636486.6884/flat,500x,075,f.u2.jpg",
      category: "no_category",
      collection: "no_collection",
      imageName: null,
      backgroundColor: "#FFFFFF",
      backgroundColors: "",
      shared: false,
      // The mockup color is never known at listing time — it's only extracted from a
      // /shop/ap/<workId> fetch (see the sync-level "props.mockup_tshirt" tests below).
      props: null,
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
                { previewTypeId: "alternate_product_close", url: "https://ih1.redbubble.net/image.99.1/alt.jpg" },
                { previewTypeId: "product_close", url: "https://ih1.redbubble.net/image.88.1/main.jpg" },
              ],
            },
            work: { id: "11111111", title: "Foo", tags: [] },
          },
        },
      ],
    });

    const result = parseShopNextData(html);
    expect(result.designs[0].externalImageUrl).toBe(
      "https://ih1.redbubble.net/image.88.1/flat,500x,075,f.u2.jpg",
    );
  });

  it("dedupes by externalId, keeping the first occurrence", () => {
    const html = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 22222222,
          title: "First",
          productPageUrl: "https://www.redbubble.com/i/t-shirt/First/22222222",
          imageUrl: "https://ih1.redbubble.net/image.1.1/first.jpg",
        }),
        rbResultEntry({
          workId: 22222222,
          title: "First (sticker)",
          productPageUrl: "https://www.redbubble.com/i/sticker/First/22222222",
          imageUrl: "https://ih1.redbubble.net/image.2.1/first-sticker.jpg",
        }),
      ],
    });

    const result = parseShopNextData(html);
    expect(result.designs).toHaveLength(1);
    expect(result.designs[0].title).toBe("First");
  });

  it("skips entries missing id/title/product page/preview image", () => {
    const html = nextDataHtml({
      results: [
        { inventoryItem: { productPageUrl: "", previewSet: { previews: [] }, work: { id: "1", title: "" } } },
      ],
    });
    const result = parseShopNextData(html);
    expect(result.designs).toHaveLength(0);
  });

  it("maps artistInfo.collections and filteredCollection", () => {
    const html = nextDataHtml({
      results: [],
      artistInfo: { collections: [rbCollection(4167183, "States of the USA"), rbCollection(4167186, "Abstract Pattern")] },
      filteredCollection: { id: 4167183, title: "States of the USA", description: null, coverImageUrl: null },
    });
    const result = parseShopNextData(html);
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
    const result = parseShopNextData(html);
    expect(result.totalPages).toBe(1);
  });

  it("throws a clear error when __NEXT_DATA__ is missing", () => {
    expect(() => parseShopNextData("<html><body>no next data here</body></html>")).toThrow(
      /Redbubble page has no __NEXT_DATA__/,
    );
  });

  it("throws a clear error when __NEXT_DATA__ contains invalid JSON", () => {
    const html =
      '<html><head><script id="__NEXT_DATA__" type="application/json">{not json}</script></head></html>';
    expect(() => parseShopNextData(html)).toThrow(/Redbubble page has no __NEXT_DATA__/);
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
    updateResponses = [];
    upsertResponses = [];
    collectionsUpsertResponses = [];
    designIdLookupResponses = [];
    designCollectionsUpsertResponses = [];
    designCollectionsDeleteResponses = [];
    slugLikeResponses = [];
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
        rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.1.1/a.jpg" }),
        rbResultEntry({ workId: 22222222, title: "Design B", productPageUrl: productB, imageUrl: "https://ih1.redbubble.net/image.2.1/b.jpg" }),
      ],
      pagination: { totalPages: 1 },
      artistInfo: { collections: [rbCollection(100, "Cats"), rbCollection(200, "Dogs")] },
      filteredCollection: null,
    });

    const catsPage = nextDataHtml({
      results: [
        rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.1.1/a.jpg" }),
      ],
      pagination: null,
      artistInfo: { collections: [rbCollection(100, "Cats"), rbCollection(200, "Dogs")] },
      filteredCollection: rbCollection(100, "Cats"),
    });

    const dogsPage = nextDataHtml({
      results: [
        rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.1.1/a.jpg" }),
        rbResultEntry({ workId: 22222222, title: "Design B", productPageUrl: productB, imageUrl: "https://ih1.redbubble.net/image.2.1/b.jpg" }),
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
      if (u === "https://www.redbubble.com/shop/ap/11111111") {
        return new Response(
          shopApHtml("Desc A", { workId: 11111111, imageA: "1", colorToken: WHITE_TOKEN }),
          { status: 200 },
        );
      }
      if (u === "https://www.redbubble.com/shop/ap/22222222") {
        return new Response(
          shopApHtml("Desc B", { workId: 22222222, imageA: "2", colorToken: BLACK_TOKEN }),
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
        rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.1.1/a.jpg" }),
      ],
      pagination: { totalPages: 2 },
      artistInfo: { collections: [rbCollection(100, "Cats")] },
      filteredCollection: rbCollection(100, "Cats"),
    });
    const catsPageTwo = nextDataHtml({
      results: [
        // Same design repeated on page 2 (paging overlap) — must not double the link.
        rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.1.1/a.jpg" }),
      ],
      pagination: { totalPages: 2 },
      artistInfo: { collections: [rbCollection(100, "Cats")] },
      filteredCollection: rbCollection(100, "Cats"),
    });
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.1.1/a.jpg" }),
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
      if (u === "https://www.redbubble.com/shop/ap/11111111") {
        return new Response(shopApHtml("Desc A"), { status: 200 });
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
    selectByIdResponses = [{ data: [existingRow({ externalId: 11111111 })], error: null }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const updates = updateCalls();
    const designUpdate = forTable(updates, "designs").find((u) => u.filters[0].val === 11111111);
    expect(designUpdate?.changes.collection).toBe("Cats");
    expect(result.updated).toBe(1);
  });

  it("dry-run: makes no writes and returns a collections + links plan", async () => {
    vi.stubGlobal("fetch", mockShopWithCollections());

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL, dryRun: true }));

    expect(insertCalls()).toHaveLength(0);
    expect(updateCalls()).toHaveLength(0);
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

  it("collectionsComplete=false: skips collections/links writes, leaves collection untouched, backfills mockup, and warns", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.startsWith(SHOP_URL) && u.includes("collections=100")) {
        throw new Error("network error fetching Cats collection");
      }
      const base = mockShopWithCollections();
      return base(u);
    });
    vi.stubGlobal("fetch", fetchMock);

    selectByIdResponses = [{ data: [existingRow({ externalId: 11111111 })], error: null }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(forTable(upsertCalls(), "collections")).toHaveLength(0);
    expect(deleteCalls()).toHaveLength(0);
    expect(forTable(upsertCalls(), "design_collections")).toHaveLength(0);
    expect(result.collections.upserted).toBe(0);
    expect(result.collections.links).toBe(0);
    expect(result.warnings.some((w) => /Collections crawl incomplete/.test(w))).toBe(true);

    // Existing row (Design A, externalId 11111111): collection must not be touched, but a
    // missing mockup_tshirt is still backfilled independently of collectionsComplete.
    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].changes).sort()).toEqual(["props", "updatedAt"]);
    expect(updates[0].changes.props).toEqual({
      mockup_tshirt: mockupUrl({ imageA: "1", last4: "1111", colorToken: WHITE_TOKEN }),
    });
    expect(result.updated).toBe(1);
  });

  it("truncated collection (totalPages > maxPages): collectionsComplete=false, no collections/links writes, mockup still backfilled", async () => {
    const catsPageTruncated = nextDataHtml({
      results: [
        rbResultEntry({ workId: 11111111, title: "Design A", productPageUrl: productA, imageUrl: "https://ih1.redbubble.net/image.1.1/a.jpg" }),
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

    selectByIdResponses = [{ data: [existingRow({ externalId: 11111111 })], error: null }];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL, maxPages: 1 }));

    expect(result.warnings.some((w) => /Collection "Cats" truncated at maxPages=1 of totalPages=2/.test(w))).toBe(
      true,
    );
    expect(forTable(upsertCalls(), "collections")).toHaveLength(0);
    expect(forTable(upsertCalls(), "design_collections")).toHaveLength(0);
    expect(deleteCalls()).toHaveLength(0);
    expect(result.collections.upserted).toBe(0);
    expect(result.collections.links).toBe(0);

    // Collection sync is skipped, but the missing mockup is still backfilled independently.
    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].changes).sort()).toEqual(["props", "updatedAt"]);
    expect(updates[0].changes.props).toEqual({
      mockup_tshirt: mockupUrl({ imageA: "1", last4: "1111", colorToken: WHITE_TOKEN }),
    });
    expect(result.updated).toBe(1);
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

// ---------------------------------------------------------------------------
// props.mockup_tshirt backfill on existing rows
// ---------------------------------------------------------------------------

describe("syncRedbubbleToSupabase — props.mockup_tshirt backfill", () => {
  beforeEach(() => {
    calls = [];
    selectByIdResponses = [];
    selectByTitleResponses = [];
    insertResponses = [];
    updateResponses = [];
    upsertResponses = [];
    collectionsUpsertResponses = [];
    designIdLookupResponses = [];
    designCollectionsUpsertResponses = [];
    designCollectionsDeleteResponses = [];
    slugLikeResponses = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const productA = "https://www.redbubble.com/i/t-shirt/Design-A-by-someartist/11111111.FB110";

  // No collections declared: collectionsComplete stays true with nothing to crawl, so the
  // "existing row is updated" path always includes `collection` — isolating the props effect.
  function mockSimpleShop(shopApByWorkId: Record<number, string> = {}) {
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 11111111,
          title: "Design A",
          productPageUrl: productA,
          imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg",
        }),
      ],
      pagination: { totalPages: 1 },
    });
    return mockShop(shopPage, shopApByWorkId);
  }

  it("existing row with props: null gets its mockup backfilled, alongside the collection update", async () => {
    vi.stubGlobal(
      "fetch",
      mockSimpleShop({
        11111111: shopApHtml("Desc A", { workId: 11111111, imageA: "999", colorToken: WHITE_TOKEN }),
      }),
    );
    selectByIdResponses = [
      {
        data: [{ externalId: 11111111, props: null }],
        error: null,
      },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].changes).sort()).toEqual(["collection", "props", "updatedAt"]);
    // Built from the /shop/ap/<workId> fetch, not from any stored externalImageUrl.
    expect(updates[0].changes.props).toEqual({
      mockup_tshirt: mockupUrl({ imageA: "999", last4: "1111", colorToken: WHITE_TOKEN }),
    });
    expect(result.updated).toBe(1);
  });

  it("existing row with other props keys keeps them and adds mockup_tshirt alongside", async () => {
    vi.stubGlobal(
      "fetch",
      mockSimpleShop({
        11111111: shopApHtml("Desc A", { workId: 11111111, imageA: "888", colorToken: BLACK_TOKEN }),
      }),
    );
    selectByIdResponses = [
      {
        data: [{ externalId: 11111111, props: { foo: "bar" } }],
        error: null,
      },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(updates[0].changes.props).toEqual({
      foo: "bar",
      mockup_tshirt: mockupUrl({ imageA: "888", last4: "1111", colorToken: BLACK_TOKEN }),
    });
    expect(result.updated).toBe(1);
  });

  it("existing row that already has mockup_tshirt: update omits props entirely, no /shop/ap fetch (collection still synced)", async () => {
    // mockSimpleShop() has no /shop/ap mock registered — a fetch attempt would throw and
    // fail this test, so a passing run proves no fetch happened for this row.
    vi.stubGlobal("fetch", mockSimpleShop());
    selectByIdResponses = [
      {
        data: [
          {
            externalId: 11111111,
            props: { mockup_tshirt: "https://existing.example/already-there.jpg" },
          },
        ],
        error: null,
      },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].changes).sort()).toEqual(["collection", "updatedAt"]);
    expect(updates[0].changes).not.toHaveProperty("props");
    expect(result.updated).toBe(1);
  });

  it("existing row that already has mockup_tshirt, collectionsComplete=false: no update at all", async () => {
    const shopPage = nextDataHtml({
      results: [
        rbResultEntry({
          workId: 11111111,
          title: "Design A",
          productPageUrl: productA,
          imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg",
        }),
      ],
      pagination: { totalPages: 1 },
      artistInfo: { collections: [rbCollection(100, "Cats")] },
    });
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.startsWith(SHOP_URL) && u.includes("collections=100")) {
        throw new Error("network error fetching Cats collection");
      }
      if (u.startsWith(SHOP_URL) && u.includes("page=1")) return new Response(shopPage, { status: 200 });
      if (u.startsWith(SHOP_URL) && u.includes("page=2")) return new Response(nextDataHtml({ results: [] }), { status: 200 });
      throw new Error(`unexpected fetch: ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    selectByIdResponses = [
      {
        data: [
          {
            externalId: 11111111,
            props: { mockup_tshirt: "https://existing.example/already-there.jpg" },
          },
        ],
        error: null,
      },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    expect(updateCalls()).toHaveLength(0);
    expect(result.updated).toBe(0);
    expect(result.warnings.some((w) => /left unchanged/.test(w))).toBe(true);
  });

  it("dry-run: plan.update includes props for a row whose mockup needs backfilling", async () => {
    vi.stubGlobal(
      "fetch",
      mockSimpleShop({
        11111111: shopApHtml("Desc A", { workId: 11111111, imageA: "555", colorToken: WHITE_TOKEN }),
      }),
    );
    selectByIdResponses = [
      {
        data: [{ externalId: 11111111, props: null }],
        error: null,
      },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL, dryRun: true }));

    expect(updateCalls()).toHaveLength(0);
    expect(result.plan?.update).toEqual([
      {
        externalId: 11111111,
        collection: "no_collection",
        props: { mockup_tshirt: mockupUrl({ imageA: "555", last4: "1111", colorToken: WHITE_TOKEN }) },
      },
    ]);
  });

  it("existing design not found on /shop/ap: no props change, warning recorded", async () => {
    vi.stubGlobal(
      "fetch",
      mockSimpleShop({
        11111111: shopApHtml("Desc A"), // no Classic T-Shirt preview in this fixture
      }),
    );
    selectByIdResponses = [
      {
        data: [{ externalId: 11111111, props: null }],
        error: null,
      },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].changes).sort()).toEqual(["collection", "updatedAt"]);
    expect(updates[0].changes).not.toHaveProperty("props");
    expect(
      result.warnings.some((w) => w === "No Classic T-Shirt preview for 11111111; mockup_tshirt not set"),
    ).toBe(true);
  });

  it("existing design /shop/ap fetch error: no props change, error message recorded, row otherwise handled as today", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.startsWith(SHOP_URL) && u.includes("page=1")) {
        return new Response(
          nextDataHtml({
            results: [
              rbResultEntry({
                workId: 11111111,
                title: "Design A",
                productPageUrl: productA,
                imageUrl: "https://ih1.redbubble.net/image.111.1/a.jpg",
              }),
            ],
            pagination: { totalPages: 1 },
          }),
          { status: 200 },
        );
      }
      if (u.startsWith(SHOP_URL) && u.includes("page=2")) return new Response(nextDataHtml({ results: [] }), { status: 200 });
      if (u === "https://www.redbubble.com/shop/ap/11111111") throw new Error("network error");
      throw new Error(`unexpected fetch: ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    selectByIdResponses = [
      {
        data: [{ externalId: 11111111, props: null }],
        error: null,
      },
    ];

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0].changes).sort()).toEqual(["collection", "updatedAt"]);
    expect(updates[0].changes).not.toHaveProperty("props");
    expect(result.errorMessages.some((m) => m.includes("Failed to fetch /shop/ap/11111111"))).toBe(true);
    expect(result.errors).toBeGreaterThan(0);
    expect(result.updated).toBe(1);
  });

  it("new design not found on /shop/ap: props null, warning recorded", async () => {
    vi.stubGlobal(
      "fetch",
      mockSimpleShop({
        11111111: shopApHtml("Desc A"), // no Classic T-Shirt preview in this fixture
      }),
    );

    const result = await syncRedbubbleToSupabase(baseOptions({ shopUrl: SHOP_URL }));

    const inserts = insertCalls();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].rows[0].props).toBeNull();
    // No mockup means no color token to rewrite the image with — the design keeps the
    // old "white fills transparency" default instead of a raf,... background URL.
    expect(inserts[0].rows[0].externalImageUrl).toBe("https://ih1.redbubble.net/image.111.1/flat,500x,075,f.u2.jpg");
    expect(inserts[0].rows[0].backgroundColor).toBe("#FFFFFF");
    expect(
      result.warnings.some((w) => w === "No Classic T-Shirt preview for 11111111; mockup_tshirt not set"),
    ).toBe(true);
  });
});
