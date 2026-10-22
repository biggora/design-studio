import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {load} from "cheerio";
import {beforeEach, describe, expect, it, vi} from "vitest";
import defaults from "@/config/config.json";
import {Design} from "@/types/design";

const designFixture = (over: Partial<Design> = {}): Design => ({
  id: "d1", slug: "cat-design", title: "Cat Design", description: "A cat design.",
  collection: "Pet lovers", externalImageUrl: "https://ih1.redbubble.net/a.jpg",
  backgroundColor: "", ...over,
} as Design);

let config = {...defaults, name: "Example Studio", domain: "example.test"};
let designs: Design[] = [];
const fetchFeaturedCollections = vi.fn();
vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => config,
  fetchDesigns: async () => ({designs, total: designs.length}),
  fetchFeaturedCollections: (...args: unknown[]) => fetchFeaturedCollections(...args),
  fetchLiveGiftPages: async (value: unknown) => (await import("@/lib/gifts")).getGiftPages(value)
    .filter(page => page.sections.some(section => section.collection !== "Empty")),
}));
vi.mock("next/link", () => ({default: ({children, ...props}: React.ComponentProps<"a">) => <a {...props}>{children}</a>}));
vi.mock("next/image", () => ({default: ({src, alt, className}: {src: string; alt: string; className?: string}) => React.createElement("img", {src, alt, className})}));

beforeEach(() => {
  config = {...defaults, name: "Example Studio", domain: "example.test"};
  designs = [];
  fetchFeaturedCollections.mockReset().mockResolvedValue([
    {collection: "Pet lovers", title: "Cat & Dog Prints", heading: "Pet Prints", total: 23},
  ]);
});

describe("home catalog discovery", () => {
  it("leads with the artwork hero, followed by native search, crawlable themes and prints", async () => {
    designs = [
      designFixture(),
      designFixture({id: "d2", slug: "dog-design", title: "Dog Design"}),
      designFixture({id: "d3", slug: "bat-design", title: "Bat Design"}),
    ];
    const {default: Home} = await import("./page");
    const html = renderToStaticMarkup(await Home());
    const $ = load(html);
    const form = $('form[role="search"]');
    expect(form.attr("action")).toBe("/designs");
    expect(form.attr("method")).toBe("get");
    expect(form.find('input[name="search"]').attr("id")).toBe($("label").attr("for"));
    expect(form.find('button[type="submit"]').text()).toBe("Search");
    expect($('nav[aria-label="Browse by interest"] a').first().attr("href")).toBe("/designs?collection=Pet+lovers");
    expect($('nav[aria-label="Browse by interest"] a').last().attr("href")).toBe("/collections");
    expect($('nav[aria-label="Browse by interest"] a').last().text().trim()).toBe("See all collections");
    expect($("h1")).toHaveLength(1);
    expect($('section[aria-labelledby="home-heading"]')).toHaveLength(1);
    expect(html.indexOf('aria-labelledby="home-heading"')).toBeLessThan(html.indexOf("<form"));
    expect(html.indexOf("<form")).toBeLessThan(html.indexOf('aria-labelledby="featured-heading"'));
    expect(html.indexOf("Browse by interest")).toBeLessThan(html.indexOf('aria-labelledby="featured-heading"'));
    // The hero frames the latest design; the featured band shows the rest,
    // without repeating the hero or teaser pieces.
    expect($('section[aria-labelledby="home-heading"] img')).toHaveLength(1);
    expect($('section[aria-labelledby="featured-heading"] h2')).toHaveLength(2);
    expect($('section[aria-labelledby="featured-heading"]').text()).not.toContain("Cat Design");
  });

  it("uses configurable catalog copy in the heading and metadata with the deployment brand", async () => {
    config = {...config, home: {...config.home, title: "Artwork & Gifts", heading: "Find artwork you love", description: "Search our artwork and browse by interest."}};
    const {default: Home, generateMetadata} = await import("./page");
    const $ = load(renderToStaticMarkup(await Home()));
    expect($("h1").text().trim()).toBe(config.home.heading);
    const metadata = await generateMetadata();
    expect(metadata.title).toBe("Artwork & Gifts - Example Studio");
    expect(metadata.description).toBe(config.home.description);
    expect(metadata.openGraph?.url).toBe("https://example.test");
    expect(metadata.alternates?.canonical).toBe("/");
    expect(metadata.robots).toBeUndefined();
  });

  it("fills the featured band with six prints — two clean rows of three", async () => {
    designs = Array.from({length: 8}, (_, i) =>
      designFixture({id: `d${i + 1}`, slug: `design-${i + 1}`, title: `Design ${i + 1}`}));
    const {default: Home} = await import("./page");
    const $ = load(renderToStaticMarkup(await Home()));
    // Hero and teaser lead the page; the band shows exactly the next six.
    expect($("section[aria-labelledby=\"home-heading\"] img")).toHaveLength(1);
    expect($('section[aria-labelledby="featured-heading"] img')).toHaveLength(6);
    expect($('section[aria-labelledby="featured-heading"]').text()).not.toContain("Design 1");
  });

  it("fills the hero art frame with the artwork (cover in a 3:4 box, no bars)", async () => {
    designs = [designFixture()];
    const {default: Home} = await import("./page");
    const $ = load(renderToStaticMarkup(await Home()));
    const img = $("section[aria-labelledby=\"home-heading\"] img");
    expect(img.attr("class")).toContain("object-cover");
    expect(img.attr("class")).toContain("object-center");
    expect(img.attr("class")).not.toContain("object-contain");
    expect(img.parent().attr("class")).toContain("aspect-[3/4]");
    expect(img.closest("a").attr("class")).toContain("overflow-hidden");
  });

  it("shows a Gift ideas block only when gift pages are configured", async () => {
    const {default: Home} = await import("./page");
    expect(load(renderToStaticMarkup(await Home()))('nav[aria-label="Gift ideas"]')).toHaveLength(0);
    config = {...config, giftPages: [{slug: "cats", title: "Cat Gifts", description: "D", intro: "I",
      sections: [{collection: "Cats", heading: "H"}]}]} as typeof config;
    const html = renderToStaticMarkup(await Home());
    const $ = load(html);
    expect($('nav[aria-label="Gift ideas"]').text()).toContain("Gift ideas");
    expect($('nav[aria-label="Gift ideas"] a').first().attr("href")).toBe("/gifts/cats");
    expect(html.indexOf("Browse by interest")).toBeLessThan(html.indexOf("Gift ideas"));
  });

  it("omits gift pages that have no designs from the home block", async () => {
    config = {...config, giftPages: [{slug: "none", title: "None", description: "D", intro: "I",
      sections: [{collection: "Empty", heading: "H"}]}]} as typeof config;
    const {default: Home} = await import("./page");
    expect(load(renderToStaticMarkup(await Home()))('nav[aria-label="Gift ideas"]')).toHaveLength(0);
  });

  it("keeps catalog access when there are no promoted collections", async () => {
    fetchFeaturedCollections.mockResolvedValue([]);
    const {default: Home} = await import("./page");
    const $ = load(renderToStaticMarkup(await Home()));
    expect($('form[role="search"]')).toHaveLength(1);
    expect($('nav[aria-label="Browse by interest"]')).toHaveLength(0);
    expect($('a[href="/designs"]').first().text()).toContain("Browse designs");
  });
});
