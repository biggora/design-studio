import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { getTshirtOffers, parsePriceSnapshot, tshirtPriceSources, type TshirtOffer } from "./marketplace-prices";
import type { Design } from "@/types/design";
const id = "123e4567-e89b-12d3-a456-426614174000";
const now = new Date("2026-10-29T07:00:00Z");
const offer: TshirtOffer = { platform: "redbubble", seller: "Redbubble", name: "Basket Classic T-Shirt", url: "https://www.redbubble.com/i/t-shirt/Basket/123/lrcw", price: "26.21", currency: "EUR", checkedAt: now.toISOString(), expiresAt: "2026-10-30T19:00:00Z" };
const sources = [{ platform: "redbubble" as const, url: "https://www.redbubble.com/shop/ap/123" }];
const snapshot = (offers: unknown[] = [offer]) => ({ version: 1, designId: id, offers });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://our-cdn.test"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("reads only our CDN, with a five-minute cache and without requesting a marketplace", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(snapshot())));
  expect(await getTshirtOffers(id, sources)).toEqual([offer]);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(`https://our-cdn.test/prices/${id}/tshirt-v1.json`, expect.objectContaining({ redirect: "error", next: { revalidate: 300, tags: ["marketplace-prices"] } }));
});
it("retains a daily snapshot but excludes prices after 36 hours, a sale end, or a future check", () => {
  expect(parsePriceSnapshot(snapshot(), id, sources, now.getTime() + 25 * 3600000)).toHaveLength(1);
  expect(parsePriceSnapshot(snapshot(), id, sources, now.getTime() + 36 * 3600000)).toEqual([]);
  expect(parsePriceSnapshot(snapshot([{ ...offer, priceValidUntil: "2026-10-28" }]), id, sources, now.getTime())).toEqual([]);
  expect(parsePriceSnapshot(snapshot(), id, sources, now.getTime() - 1)).toEqual([]);
});
it("rejects another design, changed listing identity, invalid amounts and invalid currencies", () => {
  expect(parsePriceSnapshot(snapshot(), "another-id", sources, now.getTime())).toEqual([]);
  for (const changed of [{ url: "https://www.redbubble.com/i/t-shirt/Other/456/lrcw" }, { url: "https://evil.test/i/t-shirt/Basket/123/lrcw" }, { price: "free" }, { price: "0" }, { currency: "ZZZ" }]) expect(parsePriceSnapshot(snapshot([{ ...offer, ...changed }]), id, sources, now.getTime())).toEqual([]);
});
it("chooses the same first canonical listing for collector and renderer when a platform has multiple accounts", () => {
  const design = { externalId: 123, externalLink: sources[0].url, props: {} } as Design;
  const selected = tshirtPriceSources(design, [
    { platform: "tostadora", url: "https://www.tostadora.co.uk/web/basket/456" },
    { platform: "tostadora", url: "https://www.tostadora.com/web/basket/789" },
  ]);
  expect(selected).toEqual([...sources, { platform: "tostadora", url: "https://www.tostadora.co.uk/web/basket/456" }]);
  const tostadora = { ...offer, platform: "tostadora", url: selected[1].url };
  expect(parsePriceSnapshot(snapshot([tostadora]), id, selected, now.getTime())).toHaveLength(1);
});
it("degrades to the existing page when CDN data is missing, unavailable or malformed", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  for (const response of [new Response("", { status: 404 }), new Response("not JSON"), new Response(JSON.stringify({ ...snapshot(), version: 2 }))]) {
    fetcher.mockResolvedValueOnce(response);
    expect(await getTshirtOffers(id, sources)).toEqual([]);
  }
  fetcher.mockRejectedValueOnce(new Error("timeout"));
  expect(await getTshirtOffers(id, sources)).toEqual([]);
  vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
  expect(await getTshirtOffers(id, sources)).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
