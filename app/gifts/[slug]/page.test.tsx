import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {load} from "cheerio";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {Design} from "@/types/design";

const fetchDesigns = vi.fn();
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
  fetchDesigns: (...args: unknown[]) => fetchDesigns(...args),
}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NEXT_NOT_FOUND");}}));
vi.mock("next/link", () => ({default: ({children, ...props}: React.ComponentProps<"a">) => <a {...props}>{children}</a>}));
vi.mock("@/app/components/DesignCard", () => ({DesignCard: ({design}: {design: Design}) => <article>{design.title}</article>}));

const design = (id: string, slug: string): Design => ({
  id, slug, title: `Design ${id}`, externalId: null, externalLink: "", externalImageUrl: "https://ih1.redbubble.net/a.jpg",
  category: "", collection: "Programming", imageName: "", description: "", keywords: "", backgroundColors: "",
  backgroundColor: "", createdAt: "", updatedAt: "",
});

beforeEach(() => {
  fetchDesigns.mockReset().mockImplementation(async (_page: number, _q: string, collection: string) =>
    collection === "Programming"
      ? {designs: [design("1", "one"), design("2", "two")], total: 2}
      : {designs: [], total: 0});
});

describe("/gifts/[slug]", () => {
  it("renders heading, non-empty sections, FAQ and ItemList JSON-LD", async () => {
    const {default: Page} = await import("./page");
    const html = renderToStaticMarkup(await Page({params: Promise.resolve({slug: "programmers"})}));
    const $ = load(html);
    expect($("h1").text()).toBe("Programmer Gift Ideas");
    expect(html).toContain(config.giftPages[0].intro);
    expect($("section")).toHaveLength(2); // one design section + FAQ
    expect($("h2").map((_, el) => $(el).text()).get()).toEqual(["Coding jokes", "Questions"]);
    expect(html).not.toContain("Nothing here");
    expect($("article")).toHaveLength(2);
    expect($('a[href="/designs?collection=Programming"]').text()).toBe("See all Programming designs");
    expect($("h3").text()).toBe("Do they ship?");
    expect(fetchDesigns).toHaveBeenCalledWith(1, "", "Programming", 8);
    expect(fetchDesigns).toHaveBeenCalledWith(1, "", "Empty", 8);

    const ld = $('script[type="application/ld+json"]').map((_, el) => JSON.parse($(el).text())).get().flat();
    const itemList = ld.find(item => item["@type"] === "ItemList");
    expect(itemList.itemListElement).toEqual([
      {"@type": "ListItem", position: 1, url: "https://example.test/designs/one"},
      {"@type": "ListItem", position: 2, url: "https://example.test/designs/two"},
    ]);
    const crumbs = ld.find(item => item["@type"] === "BreadcrumbList").itemListElement;
    expect(crumbs.map((item: {item: string}) => item.item)).toEqual([
      "https://example.test/", "https://example.test/gifts", "https://example.test/gifts/programmers"]);
    expect(ld.some(item => item["@type"] === "FAQPage")).toBe(false);
  });

  it("returns notFound for unknown slugs and for pages without designs", async () => {
    const {default: Page} = await import("./page");
    await expect(Page({params: Promise.resolve({slug: "nope"})})).rejects.toThrow("NEXT_NOT_FOUND");
    fetchDesigns.mockResolvedValue({designs: [], total: 0});
    await expect(Page({params: Promise.resolve({slug: "programmers"})})).rejects.toThrow("NEXT_NOT_FOUND");
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
