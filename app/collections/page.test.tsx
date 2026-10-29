import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {load} from "cheerio";
import {describe, expect, it, vi} from "vitest";

let featured: unknown[] = [
  {collection: "Pet lovers", title: "Cat & Dog Prints", heading: "Pet Prints", description: "Prints for pet people.", intro: "I", total: 23},
  {collection: "Programming", title: "Coding Prints", description: "Coding jokes.", intro: "I", total: 1},
];
vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => ({name: "Example Studio", domain: "example.test", collectionPages: []}),
  fetchFeaturedCollections: async () => featured,
}));
vi.mock("next/link", () => ({default: ({children, ...props}: React.ComponentProps<"a">) => <a {...props}>{children}</a>}));

describe("/collections", () => {
  it("renders the heading, the brand intro and one card per collection with + encoded links", async () => {
    const {default: Page} = await import("./page");
    const html = renderToStaticMarkup(await Page());
    const $ = load(html);
    expect($("h1").text()).toBe("Collections");
    expect($("p").first().text()).toContain("Example Studio");
    expect($("li a").map((_, el) => $(el).attr("href")).get()).toEqual([
      "/designs?collection=Pet+lovers", "/designs?collection=Programming"]);
    expect($("li a").first().text()).toContain("Pet Prints");
    expect($("li a").first().text()).toContain("Prints for pet people.");
    expect($("li a").first().text()).toContain("23 designs");
    expect($("li a").last().text()).toContain("Coding Prints");
    expect($("li a").last().text()).toContain("1 design");
    expect($("li a").last().text()).not.toContain("1 designs");
  });

  it("emits breadcrumb and ItemList JSON-LD with absolute collection URLs", async () => {
    const {default: Page} = await import("./page");
    const $ = load(renderToStaticMarkup(await Page()));
    const ld = JSON.parse($('script[type="application/ld+json"]').text());
    const crumbs = ld.find((item: {"@type": string}) => item["@type"] === "BreadcrumbList").itemListElement;
    expect(crumbs.map((item: {name: string}) => item.name)).toEqual(["Home", "Collections"]);
    const list = ld.find((item: {"@type": string}) => item["@type"] === "ItemList").itemListElement;
    expect(list).toEqual([
      {"@type": "ListItem", position: 1, name: "Pet Prints", url: "https://example.test/designs?collection=Pet+lovers"},
      {"@type": "ListItem", position: 2, name: "Coding Prints", url: "https://example.test/designs?collection=Programming"},
    ]);
  });

  it("sets canonical metadata and indexes when collections exist", async () => {
    const {generateMetadata} = await import("./page");
    const metadata = await generateMetadata();
    expect(metadata.title).toBe("Collections - Example Studio");
    expect(metadata.description).toContain("2 collections");
    expect(metadata.alternates?.canonical).toBe("/collections");
    expect(metadata.openGraph?.url).toBe("https://example.test/collections");
    expect(metadata.twitter?.title).toBe("Collections - Example Studio");
    expect(metadata.robots).toBeUndefined();
  });

  it("is noindex when there are no collections", async () => {
    featured = [];
    const {generateMetadata} = await import("./page");
    expect((await generateMetadata()).robots).toEqual({index: false, follow: true});
  });
});
