import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {load} from "cheerio";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {Design} from "@/types/design";

const {designs, config} = vi.hoisted(() => ({
  designs: Array.from({length: 3}, (_, i) => ({
    id: `123e4567-e89b-12d3-a456-42661417400${i}`, slug: `print-${i}`, title: `Print ${i}`,
    externalId: 123 + i, externalLink: `https://www.redbubble.com/shop/ap/${123 + i}`,
    externalImageUrl: "https://ih1.redbubble.net/print.jpg", collection: "", description: "Original print", props: {},
  })) as Design[],
  config: {name: "Shop", domain: "shop.test", collectionPages: [], giftPages: [{
    slug: "halloween", title: "Halloween Gifts", description: "Spooky prints", intro: "Pick a print", sections: [{collection: "Halloween", heading: "Spooky"}],
  }]},
}));
vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => config,
  fetchDesigns: async () => ({designs, total: 3}),
  fetchFeedCollections: async () => [], fetchFeaturedCollections: async () => [],
  fetchGiftPageDesigns: async () => ({designs, total: designs.length, collections: [], hasDesigns: true, page: 1}),
}));
vi.mock("next/navigation", () => ({redirect: () => {throw new Error("redirect");}, notFound: () => {throw new Error("not found");}}));
vi.mock("next/link", () => ({default: ({children, ...props}: React.ComponentProps<"a">) => <a {...props}>{children}</a>}));
vi.mock("next/image", () => ({default: ({src, alt}: {src: string; alt: string}) => React.createElement("img", {src, alt})}));
vi.mock("@/app/components/CatalogSearchBar", () => ({CatalogSearchBar: () => null}));
vi.mock("@/app/components/TrackCatalogState", () => ({default: () => null}));

const now = "2026-10-29T10:00:00Z";
let missing = false;
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://our-cdn.test");
  vi.useFakeTimers(); vi.setSystemTime(new Date(now)); missing = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const id = String(input).split("/").at(-2);
    const design = designs.find(design => design.id === id)!;
    if (missing && design === designs[2]) return new Response("", {status: 404});
    return new Response(JSON.stringify({version: 1, designId: id, offers: [{
      platform: "redbubble", seller: "Redbubble", name: `${design.title} Classic T-Shirt`,
      url: `https://www.redbubble.com/i/t-shirt/Print/${design.externalId}/lrcw`,
      image: "https://ih1.redbubble.net/tee.jpg", price: "26.21", currency: "EUR",
      checkedAt: now, expiresAt: "2026-10-30T22:00:00Z",
    }]}));
  });
});
afterEach(() => {vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks();});

async function render(surface: string) {
  const component = surface === "catalog"
    ? await (await import("./designs/page")).default({searchParams: Promise.resolve({})})
    : await (await import("./gifts/[slug]/page")).default({params: Promise.resolve({slug: "halloween"})});
  const $ = load(renderToStaticMarkup(component));
  const nodes = $('script[type="application/ld+json"]').toArray().flatMap(element => JSON.parse($(element).text()));
  const list = nodes.find(node => node["@type"] === "ItemList") || nodes.find(node => node["@type"] === "CollectionPage").mainEntity;
  return {$, list};
}

it.each(["catalog", "gifts"])("describes every visible %s T-shirt as Product and shows the same cached price", async surface => {
  const {$, list} = await render(surface);
  expect(list.itemListElement).toHaveLength(3);
  list.itemListElement.forEach((entry: {item: Record<string, unknown>}, i: number) => {
    expect(entry.item).toMatchObject({"@type": "Product", url: `https://shop.test/designs/print-${i}`,
      image: "https://ih1.redbubble.net/tee.jpg", offers: {price: "26.21", priceCurrency: "EUR"}});
  });
  expect($("p").filter((_, element) => $(element).text().includes("T-shirt") && $(element).text().includes("€26.21 EUR"))).toHaveLength(3);
  expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  for (const [url] of vi.mocked(globalThis.fetch).mock.calls) expect(String(url)).toMatch(/^https:\/\/our-cdn\.test\/prices\//);
});

it.each(["catalog", "gifts"])("keeps %s discoverable without inventing missing prices or incomplete carousel items", async surface => {
  missing = true;
  const {$, list} = await render(surface);
  expect(list.itemListElement.every((entry: {item?: unknown; url: string}) => !entry.item && !!entry.url)).toBe(true);
  expect($("h2 a")).toHaveLength(3);
});

it("uses a plain link list when fewer than three products are visible", async () => {
  const last = designs.pop()!;
  try {
    const {list} = await render("catalog");
    expect(list.itemListElement).toHaveLength(2);
    expect(list.itemListElement.every((entry: {item?: unknown}) => !entry.item)).toBe(true);
  } finally {designs.push(last);}
});
