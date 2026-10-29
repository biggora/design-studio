import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {load} from "cheerio";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {Design} from "@/types/design";
import type {TshirtOffer} from "@/lib/marketplace-prices";

const fetchGiftPageDesigns = vi.fn();
const offers = new Map<string, TshirtOffer>();
const config = {
  name: "Example Studio", domain: "example.test",
  giftPages: [{
    slug: "programmers", title: "Gifts for Programmers", heading: "Programmer Gift Ideas",
    description: "Coding prints for developers.", intro: "Find a print for the developer you know.",
    sections: [
      {collection: "Programming", heading: "Coding jokes", blurb: "Debugging humour."},
      {collection: "Empty", heading: "Nothing here"},
    ],
    faq: [{question: "Do they ship?", answer: "Through the marketplace."}],
  }],
};
vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => config,
  fetchGiftPageDesigns: (...args: unknown[]) => fetchGiftPageDesigns(...args),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {throw new Error("NEXT_NOT_FOUND");},
  redirect: (url: string) => {throw new Error(`REDIRECT:${url}`);},
  useRouter: () => ({push: vi.fn()}),
}));
vi.mock("next/link", () => ({default: ({children, ...props}: React.ComponentProps<"a">) => <a {...props}>{children}</a>}));
vi.mock("@/lib/marketplace-prices", () => ({getListingTshirtOffers: async () => offers}));
vi.mock("@/app/components/DesignCard", () => ({DesignCard: ({design, tshirtOffer}: {design: Design; tshirtOffer?: TshirtOffer}) =>
  <article>{design.title}{tshirtOffer && <span>{tshirtOffer.price} {tshirtOffer.currency}</span>}</article>}));

const design = (id: string, slug: string): Design => ({
  id, slug, title: `Design ${id}`, externalId: null, externalLink: "", externalImageUrl: "https://ih1.redbubble.net/a.jpg",
  category: "", collection: "Programming", imageName: "", description: "", keywords: "", backgroundColors: "",
  backgroundColor: "", createdAt: "", updatedAt: "",
});

beforeEach(() => {
  offers.clear();
  fetchGiftPageDesigns.mockReset().mockResolvedValue({
    designs: [design("1", "one"), design("2", "two")], total: 2,
    collections: ["Programming"], hasDesigns: true, page: 1,
  });
});

describe("/gifts/[slug]", () => {
  it("renders a single grid with scoped search, categories, FAQ and ItemList JSON-LD", async () => {
    const {default: Page} = await import("./page");
    const html = renderToStaticMarkup(await Page({params: Promise.resolve({slug: "programmers"})}));
    const $ = load(html);
    expect($("h1").text()).toBe("Programmer Gift Ideas");
    expect(html).toContain(config.giftPages[0].intro);
    expect($("section")).toHaveLength(1); // FAQ only
    expect($("h2").map((_, el) => $(el).text()).get()).toEqual(["Questions"]);
    expect(html).not.toContain("Nothing here");
    expect($("article")).toHaveLength(2);
    expect(html).not.toContain("Browse the");
    expect($('input[name="search"]').attr("aria-label")).toBe("Search gift designs");
    expect($('select[name="collection"] option').map((_, el) => $(el).text()).get()).toEqual(["All Collections", "Programming"]);
    expect($("h3").text()).toBe("Do they ship?");
    expect(fetchGiftPageDesigns).toHaveBeenCalledWith(config.giftPages[0], {page: 1, search: "", collection: ""});

    const ld = $('script[type="application/ld+json"]').map((_, el) => JSON.parse($(el).text())).get().flat();
    const itemList = ld.find(item => item["@type"] === "ItemList");
    expect(itemList.itemListElement).toEqual([
      {"@type": "ListItem", position: 1, name: "Design 1", url: "https://example.test/designs/one"},
      {"@type": "ListItem", position: 2, name: "Design 2", url: "https://example.test/designs/two"},
    ]);
    const crumbs = ld.find(item => item["@type"] === "BreadcrumbList").itemListElement;
    expect(crumbs.map((item: {item: string}) => item.item)).toEqual([
      "https://example.test/", "https://example.test/gifts", "https://example.test/gifts/programmers"]);
    expect(ld.some(item => item["@type"] === "FAQPage")).toBe(false);
  });

  it("returns notFound for unknown slugs and for pages without designs", async () => {
    const {default: Page} = await import("./page");
    await expect(Page({params: Promise.resolve({slug: "nope"})})).rejects.toThrow("NEXT_NOT_FOUND");
    fetchGiftPageDesigns.mockResolvedValue({designs: [], total: 0, collections: [], hasDesigns: false, page: 1});
    await expect(Page({params: Promise.resolve({slug: "programmers"})})).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("keeps empty filtered results on the gift page with a scoped reset link and noindex", async () => {
    fetchGiftPageDesigns.mockResolvedValue({designs: [], total: 0, collections: ["Programming"], hasDesigns: true, page: 1});
    const {default: Page, generateMetadata} = await import("./page");
    const props = {params: Promise.resolve({slug: "programmers"}), searchParams: Promise.resolve({search: "cat", collection: "unknown"})};
    const $ = load(renderToStaticMarkup(await Page(props)));
    expect($.text()).toContain("No designs found");
    expect($('a[href="/gifts/programmers"]').text()).toBe("Clear search & filters");
    const metadata = await generateMetadata(props);
    expect(metadata.robots).toEqual({index: false, follow: true});
    expect(metadata.alternates?.canonical).toBe("/gifts/programmers");
  });

  it("paginates the filtered topic, keeps filters and lists only visible cards with global positions", async () => {
    fetchGiftPageDesigns.mockResolvedValue({designs: [design("21", "twenty-one")], total: 45, collections: ["Programming"], hasDesigns: true, page: 2});
    const {default: Page, generateMetadata} = await import("./page");
    const props = {params: Promise.resolve({slug: "programmers"}), searchParams: Promise.resolve({search: "code", collection: "Programming", page: "2"})};
    const $ = load(renderToStaticMarkup(await Page(props)));
    const nav = $('nav[aria-label="Gift design pages"]');
    expect(nav.find("a").map((_, el) => $(el).attr("href")).get()).toEqual([
      "/gifts/programmers?search=code&collection=Programming",
      "/gifts/programmers?search=code&collection=Programming&page=3",
    ]);
    const ld = $('script[type="application/ld+json"]').map((_, el) => JSON.parse($(el).text())).get().flat();
    const items = ld.find(item => item["@type"] === "ItemList");
    expect(items.numberOfItems).toBe(45);
    expect(items.itemListElement).toHaveLength(1);
    expect(items.itemListElement[0]).toMatchObject({position: 21, name: "Design 21"});
    expect(ld.find(item => item["@type"] === "SearchResultsPage").url).toBe("https://example.test/gifts/programmers?search=code&collection=Programming&page=2");
    expect((await generateMetadata(props)).robots).toEqual({index: false, follow: true});
    const plain = {params: props.params, searchParams: Promise.resolve({page: "2"})};
    expect((await generateMetadata(plain)).alternates?.canonical).toBe("/gifts/programmers?page=2");
    expect((await generateMetadata(plain)).title).toContain("Page 2");
  });

  it("normalizes page numbers while preserving the topic and filters", async () => {
    const {default: Page} = await import("./page");
    const params = Promise.resolve({slug: "programmers"});
    for (const page of ["0", "-1", "abc", "1", "999"]) {
      await expect(Page({params, searchParams: Promise.resolve({page, search: "code", collection: "Programming"})}))
        .rejects.toThrow("REDIRECT:/gifts/programmers?search=code&collection=Programming");
    }
  });

  it("passes the same current-page prices to cards and structured Products", async () => {
    const visible = [design("1", "one"), design("2", "two"), design("3", "three")];
    fetchGiftPageDesigns.mockResolvedValue({designs: visible, total: 23, collections: [], hasDesigns: true, page: 2});
    for (const d of visible) offers.set(d.id, {
      platform: "redbubble", seller: "Redbubble", name: `${d.title} Classic T-Shirt`, price: "26.21", currency: "EUR",
      url: "https://www.redbubble.com/shop/ap/1", checkedAt: "2026-10-29T00:00:00Z", expiresAt: "2026-10-30T00:00:00Z",
    });
    const {default: Page} = await import("./page");
    const $ = load(renderToStaticMarkup(await Page({params: Promise.resolve({slug: "programmers"}), searchParams: Promise.resolve({page: "2"})})));
    expect($("article span").map((_, el) => $(el).text()).get()).toEqual(Array(3).fill("26.21 EUR"));
    const data = $('script[type="application/ld+json"]').map((_, el) => JSON.parse($(el).text())).get().flat();
    const items = data.find(item => item["@type"] === "ItemList").itemListElement;
    expect(items.map((item: {position: number}) => item.position)).toEqual([21, 22, 23]);
    expect(items.every((item: {item: {offers: {price: string; priceCurrency: string}}}) =>
      item.item.offers.price === "26.21" && item.item.offers.priceCurrency === "EUR")).toBe(true);
  });

  it("sets the canonical and social metadata, and noindexes unknown pages", async () => {
    const {generateMetadata} = await import("./page");
    const metadata = await generateMetadata({params: Promise.resolve({slug: "programmers"})});
    expect(metadata.title).toBe("Gifts for Programmers - Example Studio");
    expect(metadata.description).toBe("Coding prints for developers.");
    expect(metadata.alternates?.canonical).toBe("/gifts/programmers");
    expect(metadata.openGraph?.url).toBe("https://example.test/gifts/programmers");
    expect(metadata.openGraph?.images).toHaveLength(2);
    expect(metadata.twitter?.title).toBe("Gifts for Programmers - Example Studio");
    const missing = await generateMetadata({params: Promise.resolve({slug: "nope"})});
    expect(missing.title).toBe("Gift Ideas Not Found");
    expect(missing.robots).toEqual({index: false, follow: true});
  });
});
