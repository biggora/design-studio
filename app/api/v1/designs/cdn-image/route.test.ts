import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ListingsError } from "@/lib/listings";

const { setImage, getImage } = vi.hoisted(() => ({ setImage: vi.fn(), getImage: vi.fn() }));
vi.mock("@/utils/database", () => ({ setDesignCdnImage: setImage, getDesignCdnImage: getImage }));
import { PUT, GET } from "@/app/api/v1/designs/cdn-image/route";

const sha256 = "a".repeat(64);
const sha16 = sha256.slice(0, 16);
const mockup = (n: number, kind: string, prefix = sha16) => (
  { key: `designs/${prefix}/mockups/${String(n).repeat(16)}`, kind, version: 1, width: 1024, height: 1536 }
);
const cdnImage = [mockup(1, "flat-full"), mockup(2, "hanger-full"), mockup(3, "flat-close"), mockup(4, "hanger-close")];
const put = (value: unknown, token: string | null = "test-token") => PUT(new Request("http://localhost/api/v1/designs/cdn-image", {
  method: "PUT", headers: token === null ? {} : { Authorization: `Bearer ${token}` }, body: JSON.stringify(value),
}));
const get = (query: string, token: string | null = "test-token") => GET(new Request(`http://localhost/api/v1/designs/cdn-image${query}`, {
  headers: token === null ? {} : { Authorization: `Bearer ${token}` },
}));

beforeEach(() => {
  vi.stubEnv("LISTINGS_API_TOKEN", "test-token");
  vi.clearAllMocks();
  setImage.mockImplementation(async (items: unknown[]) => items.map((_, index) => ({ index, status: "updated", designId: `design-${index}`, cdnImage })));
});
afterEach(() => vi.unstubAllEnvs());

describe("auth", () => {
  it.each([["a missing token", null], ["a wrong token", "nope"]])("rejects %s with 401 and no caching", async (_name, token) => {
    for (const response of [await put({ items: [{ sha256, cdnImage }] }, token), await get(`?sha256=${sha256}`, token)]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    }
    expect(setImage).not.toHaveBeenCalled();
    expect(getImage).not.toHaveBeenCalled();
  });
  it("answers 503 while LISTINGS_API_TOKEN is not configured", async () => {
    vi.stubEnv("LISTINGS_API_TOKEN", "");
    expect((await put({ items: [{ sha256, cdnImage }] })).status).toBe(503);
  });
});

describe("PUT validation", () => {
  it("rejects malformed JSON", async () => {
    const response = await PUT(new Request("http://localhost/x", { method: "PUT", headers: { Authorization: "Bearer test-token" }, body: "{" }));
    expect(response.status).toBe(400);
  });
  it.each([
    ["a non-object body", "x", ""],
    ["an unknown top-level key", { items: [{ sha256, cdnImage }], extra: 1 }, "extra"],
    ["missing items", {}, "items"],
    ["an empty items array", { items: [] }, "items"],
    ["101 items", { items: Array.from({ length: 101 }, () => ({ sha256, cdnImage })) }, "items"],
    ["a non-object item", { items: ["x"] }, "items[0]"],
    ["an item without identifier", { items: [{ cdnImage }] }, "items[0]"],
    ["an unknown item key", { items: [{ sha256, cdnImage, title: "x" }] }, "items[0].title"],
    ["a short sha256", { items: [{ sha256: "abc", cdnImage }] }, "items[0].sha256"],
    ["a string sourceImageId", { items: [{ sourceImageId: "299", cdnImage }] }, "items[0].sourceImageId"],
    ["a zero sourceImageId", { items: [{ sourceImageId: 0, cdnImage }] }, "items[0].sourceImageId"],
    ["a numeric redbubbleId", { items: [{ redbubbleId: 123, cdnImage }] }, "items[0].redbubbleId"],
    ["a non-digit redbubbleId", { items: [{ redbubbleId: "12a", cdnImage }] }, "items[0].redbubbleId"],
    ["an unsafe redbubbleId", { items: [{ redbubbleId: "9".repeat(19), cdnImage }] }, "items[0].redbubbleId"],
    ["a missing cdnImage", { items: [{ sha256 }] }, "items[0].cdnImage"],
    ["an old single-object cdnImage", { items: [{ sha256, cdnImage: { key: `designs/${sha16}`, version: 1, width: 1, height: 1 } }] }, "items[0].cdnImage"],
    ["an empty cdnImage", { items: [{ sha256, cdnImage: [] }] }, "items[0].cdnImage"],
    ["nine mockups", { items: [{ sha256, cdnImage: Array.from({ length: 9 }, (_, i) => mockup(i + 1, "flat-full")) }] }, "items[0].cdnImage"],
    ["a key under another sha256 when sha256 is given", { items: [{ sha256, cdnImage: [mockup(1, "flat-full", "b".repeat(16))] }] }, "items[0].cdnImage[0].key"],
    ["a bad key on the second item's second mockup", { items: [{ sha256, cdnImage }, { sha256, cdnImage: [mockup(1, "flat-full"), { ...mockup(2, "hanger-full"), key: "designs/x" }] }] }, "items[1].cdnImage[1].key"],
    ["a bad kind", { items: [{ sha256, cdnImage: [mockup(1, "side")] }] }, "items[0].cdnImage[0].kind"],
    ["a duplicate key", { items: [{ sha256, cdnImage: [mockup(1, "flat-full"), mockup(1, "hanger-full")] }] }, "items[0].cdnImage[1].key"],
    ["a zero version", { items: [{ sha256, cdnImage: [{ ...mockup(1, "flat-full"), version: 0 }] }] }, "items[0].cdnImage[0].version"],
    ["a fractional width", { items: [{ sha256, cdnImage: [{ ...mockup(1, "flat-full"), width: 1.5 }] }] }, "items[0].cdnImage[0].width"],
    ["keys of two designs without sha256", { items: [{ sourceImageId: 299, cdnImage: [mockup(1, "flat-full"), mockup(2, "hanger-full", "b".repeat(16))] }] }, "items[0].cdnImage[1].key"],
  ])("rejects %s (400, field %s)", async (_name, value, field) => {
    const response = await put(value);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION", error: expect.any(String), field });
    expect(setImage).not.toHaveBeenCalled();
  });
});

describe("PUT results", () => {
  it.each([
    ["sha256", { sha256, cdnImage }],
    ["sourceImageId", { sourceImageId: 299, cdnImage }],
    ["redbubbleId", { redbubbleId: "184507566", cdnImage }],
    ["all three", { sha256: sha256.toUpperCase(), sourceImageId: 299, redbubbleId: "184507566", cdnImage }],
  ])("accepts the %s identifier and passes the normalized item through", async (_name, item) => {
    const response = await put({ items: [item] });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ results: [{ index: 0, status: "updated", designId: "design-0", cdnImage }], updated: 1 });
    expect(setImage).toHaveBeenCalledWith([{ ...item, ...("sha256" in item ? { sha256 } : {}) }]);
  });

  it("accepts keys of one shared prefix without a sha256 (the data layer checks it against the design)", async () => {
    const other = "c".repeat(16);
    const response = await put({ items: [{ sourceImageId: 299, cdnImage: [mockup(1, "flat-full", other), mockup(2, "hanger-full", other)] }] });
    expect(response.status).toBe(200);
  });

  it("reports not_found and conflict per item without failing the batch", async () => {
    setImage.mockResolvedValue([
      { index: 0, status: "updated", designId: "d0", cdnImage },
      { index: 1, status: "not_found" },
      { index: 2, status: "conflict", designId: "d2", message: "The identifiers resolve to different designs" },
      { index: 3, status: "updated", designId: "d3", cdnImage },
    ]);
    const response = await put({ items: [{ sha256, cdnImage }, { sourceImageId: 1, cdnImage }, { sha256, sourceImageId: 2, cdnImage }, { redbubbleId: "5", cdnImage }] });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.updated).toBe(2);
    expect(body.results.map((r: { status: string }) => r.status)).toEqual(["updated", "not_found", "conflict", "updated"]);
  });

  it("maps ListingsError to its status and hides internal errors", async () => {
    setImage.mockRejectedValueOnce(new ListingsError(503, "NOT_CONFIGURED", "SUPABASE_SERVICE_ROLE_KEY is required"));
    expect((await put({ items: [{ sha256, cdnImage }] })).status).toBe(503);
    vi.spyOn(console, "error").mockImplementation(() => {});
    setImage.mockRejectedValueOnce(new Error("relation designs does not exist"));
    const response = await put({ items: [{ sha256, cdnImage }] });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("relation");
  });
});

describe("GET read-back", () => {
  it.each([
    ["sha256", `?sha256=${sha256.toUpperCase()}`, { sha256 }],
    ["sourceImageId", "?sourceImageId=299", { sourceImageId: 299 }],
    ["redbubbleId", "?redbubbleId=184507566", { redbubbleId: "184507566" }],
  ])("looks up by %s", async (_name, query, lookup) => {
    getImage.mockResolvedValue({ designId: "design-id", cdnImage });
    const response = await get(query);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ designId: "design-id", cdnImage });
    expect(getImage).toHaveBeenCalledWith(lookup);
  });
  it("returns cdnImage null for a design without mockups", async () => {
    getImage.mockResolvedValue({ designId: "design-id", cdnImage: null });
    expect(await (await get(`?sha256=${sha256}`)).json()).toEqual({ designId: "design-id", cdnImage: null });
  });
  it("answers 404 for an unknown design", async () => {
    getImage.mockResolvedValue(null);
    const response = await get("?sourceImageId=1");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
  });
  it.each([
    ["no parameter", "", "query"],
    ["two parameters", `?sha256=${sha256}&sourceImageId=1`, "query"],
    ["an unknown parameter", "?slug=x", "query"],
    ["a short sha256", "?sha256=abc", "sha256"],
    ["a bad sourceImageId", "?sourceImageId=0", "sourceImageId"],
    ["a bad redbubbleId", "?redbubbleId=abc", "redbubbleId"],
  ])("rejects %s with 400", async (_name, query, field) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION", field });
    expect(getImage).not.toHaveBeenCalled();
  });
});
