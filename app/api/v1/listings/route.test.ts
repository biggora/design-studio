import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ListingsError } from "@/lib/listings";

const { ingest, lookup, revalidate } = vi.hoisted(() => ({ ingest: vi.fn(), lookup: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/utils/database", () => ({ ingestListing: ingest, getDesignListings: lookup }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
import { POST, GET } from "@/app/api/v1/listings/route";

const sha256 = "a".repeat(64);
const mockup = (n: number, kind: string) => ({ key: `designs/${sha256.slice(0, 16)}/mockups/${String(n).repeat(16)}`, kind, version: 1, width: 1024, height: 1536 });
const cdnImage = [mockup(1, "flat-full"), mockup(2, "hanger-full"), mockup(3, "flat-close"), mockup(4, "hanger-close")];
const body = () => ({
  design: { sourceImageId: 299, sha256, title: "Space cat" },
  listing: { platform: "teepublic", account: "teepublic:main", externalId: "123", url: "https://www.teepublic.com/t-shirt/123-space-cat" },
});
function request(value: unknown = body(), token: string | null = "test-token") {
  return new Request("http://localhost/api/v1/listings", {
    method: "POST", headers: token === null ? {} : { Authorization: `Bearer ${token}` }, body: JSON.stringify(value),
  });
}
const result = {
  design: { id: "design-id", slug: "space-cat", title: "Space cat", externalId: null, sha256, sourceImageId: 299, cdnImage: null },
  listing: { id: "listing-id", ...body().listing, title: null, tags: null, thumbnailUrl: null, publishedAt: "2026-10-07T08:10:00.000Z", extra: null },
  created: { design: true, listing: true },
};

beforeEach(() => {
  vi.stubEnv("LISTINGS_API_TOKEN", "test-token");
  vi.clearAllMocks();
  ingest.mockResolvedValue(result);
});
afterEach(() => vi.unstubAllEnvs());

describe("listings auth", () => {
  it.each([null, "wrong", "x".repeat(100)])("rejects missing/wrong token %s", async token => {
    expect((await POST(request(body(), token))).status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });
  it("returns 503 when the token is not configured, for both methods", async () => {
    vi.stubEnv("LISTINGS_API_TOKEN", "");
    expect((await POST(request())).status).toBe(503);
    expect((await GET(new Request("http://localhost/api/v1/listings?sha256=" + sha256))).status).toBe(503);
  });
  it("rejects SYNC_SECRET / x-sync-secret authentication", async () => {
    vi.stubEnv("SYNC_SECRET", "test-token");
    expect((await POST(new Request("http://localhost/api/v1/listings", { method: "POST", headers: { "x-sync-secret": "test-token" }, body: JSON.stringify(body()) }))).status).toBe(401);
  });
});

describe("listings validation", () => {
  it.each([
    ["bad hash", { ...body(), design: { ...body().design, sha256: "bad" } }],
    ["bad domain", { ...body(), listing: { ...body().listing, url: "https://teepublic.com.evil.example/x" } }],
    ["tostadora on a foreign host", { ...body(), listing: { platform: "tostadora", account: "tostadora:uk", externalId: "4929329", url: "https://evil.example/account/shop/products?designId=4929329" } }],
    ["zazzle on a foreign host", { ...body(), listing: { platform: "zazzle", account: "zazzle:main", externalId: "256325396025543708", url: "https://evil.example/x-256325396025543708" } }],
    ["zazzle on the bare domain", { ...body(), listing: { platform: "zazzle", account: "zazzle:main", externalId: "256325396025543708", url: "https://zazzle.com/x-256325396025543708" } }],
    ["oversized extra", { ...body(), listing: { ...body().listing, extra: { data: "x".repeat(16384) } } }],
    ["extra bytes", { ...body(), listing: { ...body().listing, extra: { data: "🐈".repeat(5000) } } }],
    ["unknown root", { ...body(), unknown: true }],
    ["unknown design", { ...body(), design: { ...body().design, unknown: true } }],
    ["unknown listing", { ...body(), listing: { ...body().listing, unknown: true } }],
    ["null optional", { ...body(), listing: { ...body().listing, tags: null } }],
    ["javascript URL", { ...body(), listing: { ...body().listing, thumbnailUrl: "javascript:alert(1)" } }],
    ["credentials", { ...body(), listing: { ...body().listing, url: "https://user:password@teepublic.com/x" } }],
    ["invalid time", { ...body(), listing: { ...body().listing, publishedAt: "yesterday" } }],
    ["invalid calendar", { ...body(), listing: { ...body().listing, publishedAt: "2026-02-31T08:10:00Z" } }],
    ["unsupported mockup host", { ...body(), listing: { ...body().listing, extra: { mockupTshirt: "https://evil.example/x" } } }],
    ["unsupported hat mockup host", { ...body(), listing: { ...body().listing, extra: { mockupHat: "https://evil.example/x" } } }],
    ["unsupported mug mockup host", { ...body(), listing: { ...body().listing, extra: { mockupMug: "https://evil.example/x" } } }],
    ["unsupported mousepad mockup host", { ...body(), listing: { ...body().listing, extra: { mockupMousepad: "http://ih1.redbubble.net/x" } } }],
    ["too many tags", { ...body(), design: { ...body().design, tags: Array(101).fill("cat") } }],
    ["long tag", { ...body(), listing: { ...body().listing, tags: ["x".repeat(101)] } }],
    ["unsafe source ID", { ...body(), design: { ...body().design, sourceImageId: Number.MAX_SAFE_INTEGER + 1 } }],
    ["cdn old single-object form", { ...body(), design: { ...body().design, cdnImage: { key: `designs/${sha256.slice(0, 16)}`, version: 1, width: 1600, height: 1920 } } }],
    ["cdn empty array", { ...body(), design: { ...body().design, cdnImage: [] } }],
    ["cdn key mismatch", { ...body(), design: { ...body().design, cdnImage: [{ ...mockup(1, "flat-full"), key: `designs/${"b".repeat(16)}/mockups/${"1".repeat(16)}` }] } }],
    ["cdn bad kind", { ...body(), design: { ...body().design, cdnImage: [mockup(1, "side")] } }],
    ["cdn duplicate key", { ...body(), design: { ...body().design, cdnImage: [mockup(1, "flat-full"), mockup(1, "hanger-full")] } }],
    ["cdn unknown nested key", { ...body(), design: { ...body().design, cdnImage: [{ ...mockup(1, "flat-full"), format: "webp" }] } }],
    ["cdn zero version", { ...body(), design: { ...body().design, cdnImage: [{ ...mockup(1, "flat-full"), version: 0 }] } }],
    ["cdn fractional height", { ...body(), design: { ...body().design, cdnImage: [{ ...mockup(1, "flat-full"), height: 19.2 }] } }],
  ])("rejects %s", async (_name, value) => {
    const response = await POST(request(value));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION", error: expect.any(String), field: expect.any(String) });
    expect(ingest).not.toHaveBeenCalled();
  });
  it("names the cdnImage item and field on a key mismatch", async () => {
    const response = await POST(request({ ...body(), design: { ...body().design, cdnImage: [mockup(1, "flat-full"), { ...mockup(2, "hanger-full"), key: `designs/0000000000000000/mockups/${"2".repeat(16)}` }] } }));
    expect(await response.json()).toMatchObject({ code: "VALIDATION", field: "design.cdnImage[1].key" });
  });
  it("rejects malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/v1/listings", { method: "POST", headers: { Authorization: "Bearer test-token" }, body: "{" }));
    expect(response.status).toBe(400);
  });
});

describe("listings responses", () => {
  it("returns 201 on create, normalizes the hash, revalidates, never caches", async () => {
    const response = await POST(request({ ...body(), design: { ...body().design, sha256: sha256.toUpperCase() } }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(result);
    expect(ingest).toHaveBeenCalledWith(body());
    expect(revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("accepts the pod-uploader tostadora listing body", async () => {
    const tostadoraBody = {
      design: { sourceImageId: 1193, sha256, title: "Choose Joy Brush Script On Watercolor" },
      listing: {
        platform: "tostadora",
        account: "tostadora:uk",
        externalId: "4929329",
        url: "https://www.tostadora.co.uk/account/shop/products?designId=4929329",
      },
    };
    const response = await POST(request(tostadoraBody));
    expect(response.status).toBe(201);
    expect(ingest).toHaveBeenCalledWith(tostadoraBody);
  });
  it("accepts the pod-uploader zazzle listing body with extra.productUrls", async () => {
    const zazzleBody = {
      design: { sourceImageId: 523, sha256, title: "Bicycle Wheel Truing Stand Minimal Line Art" },
      listing: {
        platform: "zazzle",
        account: "zazzle:main",
        externalId: "256325396025543708",
        url: "https://www.zazzle.com/bicycle_wheel_truing_stand_minimal_line_art_t_shirt-256325396025543708",
        extra: {
          productUrls: [
            { product: "woman_t-shirt", id: "256325396025543708", url: "https://www.zazzle.com/bicycle_wheel_truing_stand_minimal_line_art_t_shirt-256325396025543708" },
            { product: "man_hoodie", id: "256324385015989740", url: "https://www.zazzle.com/bicycle_wheel_truing_stand_minimal_line_art_hoodie-256324385015989740" },
            { product: "mug", id: "256071015375456920", url: "https://www.zazzle.com/bicycle_wheel_truing_stand_minimal_line_art_coffee_mug-256071015375456920" },
          ],
        },
      },
    };
    const response = await POST(request(zazzleBody));
    expect(response.status).toBe(201);
    expect(ingest).toHaveBeenCalledWith(zazzleBody);
  });
  it("returns 200 for an idempotent repeat", async () => {
    ingest.mockResolvedValue({ ...result, created: { design: false, listing: false } });
    expect((await POST(request())).status).toBe(200);
  });
  it("passes the four mockups in cdnImage through and returns them in the design (POST round-trip)", async () => {
    ingest.mockResolvedValue({ ...result, design: { ...result.design, cdnImage } });
    const input = { ...body(), design: { ...body().design, cdnImage } };
    const response = await POST(request(input));
    expect(response.status).toBe(201);
    expect(ingest).toHaveBeenCalledWith(input);
    expect((await response.json()).design.cdnImage).toEqual(cdnImage);
  });
  it("revalidates on a repeat whose only change is cdnImage and returns it in the design", async () => {
    ingest.mockResolvedValue({ ...result, created: { design: false, listing: false }, design: { ...result.design, cdnImage } });
    const response = await POST(request({
      ...body(),
      design: { ...body().design, cdnImage },
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).design.cdnImage).toEqual(cdnImage);
    expect(revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("preserves conflict details and does not revalidate on failure", async () => {
    ingest.mockRejectedValue(new ListingsError(409, "CONFLICT", "Identity conflict", undefined, { designId: "other" }));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Identity conflict", code: "CONFLICT", details: { designId: "other" } });
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("does not leak internal database errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    ingest.mockRejectedValue(new Error("database credential"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error", code: "INTERNAL" });
    log.mockRestore();
  });
  it.each([`sha256=${sha256.toUpperCase()}`, "sourceImageId=299"])("looks up by %s", async query => {
    lookup.mockResolvedValue({ design: result.design, listings: [result.listing] });
    const response = await GET(new Request(`http://localhost/api/v1/listings?${query}`, { headers: { Authorization: "Bearer test-token" } }));
    expect(response.status).toBe(200);
    expect(lookup).toHaveBeenCalledWith(query.startsWith("sha256") ? { sha256 } : { sourceImageId: 299 });
    expect(await response.json()).toEqual({ design: result.design, listings: [result.listing] });
  });
  it("returns 404 when the design is absent", async () => {
    lookup.mockResolvedValue(null);
    expect((await GET(new Request(`http://localhost/api/v1/listings?sha256=${sha256}`, { headers: { Authorization: "Bearer test-token" } }))).status).toBe(404);
  });
  it.each(["", "sha256=bad", "sourceImageId=0", "sourceImageId=1.5", `sha256=${sha256}&sourceImageId=299`, "sourceImageId=299&other=1", "sourceImageId=299&sourceImageId=299"])("rejects invalid query %s", async query => {
    expect((await GET(new Request(`http://localhost/api/v1/listings?${query}`, { headers: { Authorization: "Bearer test-token" } }))).status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
  });
});
