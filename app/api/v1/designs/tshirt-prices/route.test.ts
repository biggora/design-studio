import { beforeEach, afterEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ fetchDesigns: vi.fn(), getDesignById: vi.fn(), fetchPublicListings: vi.fn() }));
vi.mock("@/utils/database", () => db);
import { GET } from "./route";
const id = "123e4567-e89b-12d3-a456-426614174000";
const design = { id, title: "Basket", externalId: 123, externalLink: "https://www.redbubble.com/shop/ap/123", props: { teepublicLink: "https://www.teepublic.com/t-shirt/456-basket?ref_id=test" } };
const request = (query = "", token = "test") => new Request(`https://store.test/api/v1/designs/tshirt-prices${query}`, { headers: { Authorization: `Bearer ${token}` } });
beforeEach(() => { vi.stubEnv("LISTINGS_API_TOKEN", "test"); vi.clearAllMocks(); db.fetchDesigns.mockResolvedValue({ designs: [design], total: 1 }); db.getDesignById.mockResolvedValue({ design }); db.fetchPublicListings.mockResolvedValue({ [id]: [{ platform: "tostadora", url: "https://www.tostadora.co.uk/web/basket/789" }, { platform: "zazzle", url: "https://www.zazzle.com/basket_t_shirt-123456789" }] }); });
afterEach(() => vi.unstubAllEnvs());
it("requires the existing token before any database access", async () => {
  expect((await GET(request("", "wrong"))).status).toBe(401);
  expect(db.fetchDesigns).not.toHaveBeenCalled();
});
it("provides canonical linked sources with no marketplace fetch or affiliate wrapping", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  const response = await GET(request());
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.items[0].sources).toEqual([
    { platform: "redbubble", url: "https://www.redbubble.com/shop/ap/123" },
    { platform: "teepublic", url: "https://www.teepublic.com/t-shirt/456-basket" },
    { platform: "tostadora", url: "https://www.tostadora.co.uk/web/basket/789" },
    { platform: "zazzle", url: "https://www.zazzle.com/basket_t_shirt-123456789" },
  ]);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRestore();
});
it("returns 404 for an inactive or absent design and rejects invalid pagination", async () => {
  db.getDesignById.mockResolvedValue(null);
  expect((await GET(request(`?id=${id}`))).status).toBe(404);
  expect((await GET(request("?page=0"))).status).toBe(400);
  expect((await GET(request(`?id=${"-".repeat(36)}`))).status).toBe(400);
});
