import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {load} from "cheerio";
import {describe, expect, it, vi} from "vitest";

let giftPages: unknown = [
  {slug: "programmers", title: "Gifts for Programmers", heading: "Programmer Gifts", description: "Coding prints.", intro: "I",
    sections: [{collection: "Programming", heading: "H"}]},
  {slug: "cats", title: "Cat Gifts", description: "Prints for cat people.", intro: "I", sections: [{collection: "Cats", heading: "H"}]},
];
let emptyCollections = new Set<string>();
vi.mock("@/utils/database", async () => {
  const {getGiftPages} = await import("@/lib/gifts");
  return {
    getSiteConfig: async () => ({name: "Example Studio", domain: "example.test", giftPages}),
    fetchLiveGiftPages: async (value: unknown) =>
      getGiftPages(value).filter(page => page.sections.some(section => !emptyCollections.has(section.collection))),
  };
});
vi.mock("next/link", () => ({default: ({children, ...props}: React.ComponentProps<"a">) => <a {...props}>{children}</a>}));

describe("/gifts", () => {
  it("lists every gift page as a card link under the index heading", async () => {
    const {default: Page, generateMetadata} = await import("./page");
    const $ = load(renderToStaticMarkup(await Page()));
    expect($("h1").text()).toBe("Gift Ideas by Interest");
    expect($("li a").map((_, el) => $(el).attr("href")).get()).toEqual(["/gifts/programmers", "/gifts/cats"]);
    expect($("li a").first().text()).toContain("Programmer Gifts");
    expect($("li a").last().text()).toContain("Prints for cat people.");
    const ld = JSON.parse($('script[type="application/ld+json"]').text());
    expect(ld.itemListElement.map((item: {name: string}) => item.name)).toEqual(["Home", "Gift Ideas"]);
    const metadata = await generateMetadata();
    expect(metadata.alternates?.canonical).toBe("/gifts");
    expect(metadata.robots).toBeUndefined();
  });

  it("renders pages in seasonal order for the current date", async () => {
    vi.useFakeTimers({toFake: ["Date"]});
    const original = giftPages;
    const seasonal = (slug: string, start: string, end: string) => ({slug, title: slug, description: "D", intro: "I",
      season: {start, end}, sections: [{collection: "Programming", heading: "H"}]});
    giftPages = [seasonal("winter", "12-01", "12-24"), {...seasonal("evergreen", "01-01", "01-01"), season: undefined}, seasonal("autumn", "10-01", "10-31")];
    try {
      const {default: Page} = await import("./page");
      vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
      let $ = load(renderToStaticMarkup(await Page()));
      expect($("li a").map((_, el) => $(el).attr("href")).get()).toEqual(["/gifts/autumn", "/gifts/evergreen", "/gifts/winter"]);
      vi.setSystemTime(new Date("2026-12-10T12:00:00Z"));
      $ = load(renderToStaticMarkup(await Page()));
      expect($("li a").map((_, el) => $(el).attr("href")).get()).toEqual(["/gifts/winter", "/gifts/evergreen", "/gifts/autumn"]);
    } finally {
      vi.useRealTimers();
      giftPages = original;
    }
  });

  it("does not link gift pages whose sections are all empty", async () => {
    emptyCollections = new Set(["Cats"]);
    const {default: Page} = await import("./page");
    const $ = load(renderToStaticMarkup(await Page()));
    expect($("li a").map((_, el) => $(el).attr("href")).get()).toEqual(["/gifts/programmers"]);
    emptyCollections = new Set();
  });

  it("is noindex when no live gift pages exist", async () => {
    emptyCollections = new Set(["Cats", "Programming"]);
    const {generateMetadata} = await import("./page");
    expect((await generateMetadata()).robots).toEqual({index: false, follow: true});
    emptyCollections = new Set();
  });

  it("is noindex when no gift pages are configured", async () => {
    giftPages = undefined;
    const {generateMetadata} = await import("./page");
    expect((await generateMetadata()).robots).toEqual({index: false, follow: true});
  });
});
