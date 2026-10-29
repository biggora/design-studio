import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import * as cheerio from "cheerio";
const { published, config } = vi.hoisted(() => ({
  published: vi.fn(),
  config: vi.fn(),
}));
vi.mock("@/utils/database", () => ({
  fetchPublishedArticles: published,
  getSiteConfig: config,
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const forwarded = { ...props };
    delete forwarded.unoptimized;
    return createElement("img", { ...forwarded, alt: props.alt ?? "" });
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
import Page, { generateMetadata } from "./page";
const article = {
  sourceArticleId: "blg_test",
  title: "How to wash graphic tees",
  excerpt: "Keep your favorite prints looking good.",
  imageUrl: "https://images.test/cover.png",
  imageAlt: "A graphic tee beside a washing machine",
  url: "https://shop.tumblr.com/post/123/wash",
  publishedAt: "2026-10-25T05:00:00Z",
};
beforeEach(() => {
  published.mockResolvedValue([article]);
  config.mockResolvedValue({ name: "Shop", domain: "shop.test" });
});
describe("Articles", () => {
  it("renders crawlable cards, accessible uncropped images and direct Tumblr links", async () => {
    const $ = cheerio.load(
      renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) })),
    );
    expect($("h1").text()).toBe("Articles");
    expect($("article")).toHaveLength(1);
    expect($("img").attr("alt")).toBe(article.imageAlt);
    expect($("img").attr("class")).not.toContain("object-cover");
    expect(
      $("a")
        .filter((_, el) => $(el).text() === "Read on Tumblr")
        .attr("href"),
    ).toBe(article.url);
    expect($("time").attr("datetime")).toBe(article.publishedAt);
  });
  it("paginates twelve cards and gives each page its canonical", async () => {
    published.mockResolvedValue(
      Array.from({ length: 13 }, (_, i) => ({
        ...article,
        sourceArticleId: String(i),
      })),
    );
    const props = { searchParams: Promise.resolve({ page: "2" }) };
    const $ = cheerio.load(renderToStaticMarkup(await Page(props)));
    expect($("article")).toHaveLength(1);
    expect($("nav a").attr("href")).toBe("/articles");
    expect((await generateMetadata(props)).alternates?.canonical).toBe(
      "https://shop.test/articles?page=2",
    );
  });
  it("shows an empty state with noindex", async () => {
    published.mockResolvedValue([]);
    const props = { searchParams: Promise.resolve({}) };
    expect(renderToStaticMarkup(await Page(props))).toContain("coming soon");
    expect((await generateMetadata(props)).robots).toEqual({
      index: false,
      follow: true,
    });
  });
  it("describes only the visible article announcements and their real publication dates", async () => {
    published.mockResolvedValue(Array.from({ length: 13 }, (_, i) => ({
      ...article, sourceArticleId: String(i), url: `https://shop.tumblr.com/post/${100 + i}/wash`,
    })));
    const $ = cheerio.load(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ page: "2" }) })));
    const data = JSON.parse($('script[type="application/ld+json"]').text());
    expect(data).toMatchObject({
      "@type": "CollectionPage", "@id": "https://shop.test/articles?page=2#webpage",
      isPartOf: { "@id": "https://shop.test/#website" },
      mainEntity: { "@type": "ItemList", numberOfItems: 13 },
    });
    expect(data.mainEntity.itemListElement).toHaveLength(1);
    expect(data.mainEntity.itemListElement[0]).toMatchObject({ position: 13, item: {
      "@type": "Article", url: "https://shop.tumblr.com/post/112/wash",
      headline: article.title, description: article.excerpt,
      datePublished: article.publishedAt, image: article.imageUrl,
      author: { "@id": "https://shop.test/#organization" },
    } });
    expect(data.mainEntity.itemListElement[0].item).not.toHaveProperty("articleBody");
  });
  it("returns 404 beyond verified results", async () => {
    await expect(
      Page({ searchParams: Promise.resolve({ page: "2" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
