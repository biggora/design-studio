import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {load} from "cheerio";
import {beforeEach, describe, expect, it, vi} from "vitest";
import defaults from "@/config/config.json";

let config = {...defaults, name: "Example Studio", domain: "example.test"};
const fetchFeaturedCollections = vi.fn();
vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => config,
  fetchDesigns: async () => ({designs: [], total: 0}),
  fetchFeaturedCollections: (...args: unknown[]) => fetchFeaturedCollections(...args),
}));
vi.mock("next/link", () => ({default: ({children, ...props}: React.ComponentProps<"a">) => <a {...props}>{children}</a>}));
vi.mock("@/app/components/Carousel", () => ({Carousel: () => <section data-testid="carousel">Slides</section>}));
vi.mock("@/app/components/FeaturedDesigns", () => ({default: ({title}: {title: string}) => <section data-testid="prints"><h2>{title}</h2></section>}));

beforeEach(() => {
  config = {...defaults, name: "Example Studio", domain: "example.test"};
  fetchFeaturedCollections.mockReset().mockResolvedValue([
    {collection: "Pet lovers", title: "Cat & Dog Prints", heading: "Pet Prints", total: 23},
  ]);
});

describe("home catalog discovery", () => {
  it("places the carousel first, followed by native search, crawlable themes and prints", async () => {
    const {default: Home} = await import("./page");
    const html = renderToStaticMarkup(await Home());
    const $ = load(html);
    const form = $('form[role="search"]');
    expect(form.attr("action")).toBe("/designs");
    expect(form.attr("method")).toBe("get");
    expect(form.find('input[name="search"]').attr("id")).toBe($("label").attr("for"));
    expect(form.find('button[type="submit"]').text()).toBe("Search");
    expect($('nav[aria-label="Browse by interest"] a').attr("href")).toBe("/designs?collection=Pet+lovers");
    expect($("h1")).toHaveLength(1);
    expect(html.indexOf('<form')).toBeLessThan(html.indexOf('data-testid="prints"'));
    expect(html.indexOf('Browse by interest')).toBeLessThan(html.indexOf('data-testid="prints"'));
    expect(html.indexOf('data-testid="carousel"')).toBeLessThan(html.indexOf('<form'));
    expect($('[data-testid="prints"] h2').text()).toBe("Latest Prints");
  });

  it("uses configurable catalog copy in the heading and metadata with the deployment brand", async () => {
    config = {...config, home: {title: "Artwork & Gifts", heading: "Find artwork you love", description: "Search our artwork and browse by interest."}};
    const {default: Home, generateMetadata} = await import("./page");
    const $ = load(renderToStaticMarkup(await Home()));
    expect($("h1").text()).toBe(config.home.heading);
    const metadata = await generateMetadata();
    expect(metadata.title).toBe("Artwork & Gifts - Example Studio");
    expect(metadata.description).toBe(config.home.description);
    expect(metadata.openGraph?.url).toBe("https://example.test");
    expect(metadata.alternates?.canonical).toBe("/");
    expect(metadata.robots).toBeUndefined();
  });

  it("keeps catalog access when there are no promoted collections", async () => {
    fetchFeaturedCollections.mockResolvedValue([]);
    const {default: Home} = await import("./page");
    const $ = load(renderToStaticMarkup(await Home()));
    expect($('form[role="search"]')).toHaveLength(1);
    expect($('a[href="/designs"]').text()).toBe("Browse all prints");
    expect($('nav[aria-label="Browse by interest"]')).toHaveLength(0);
  });
});
