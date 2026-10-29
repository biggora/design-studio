import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import config from "@/config/config.json";
import type { SiteConfig } from "@/lib/store";
import type { Design } from "@/types/design";
import type { TshirtOffer } from "@/lib/marketplace-prices";
import { tshirtProductJsonLd } from "@/lib/structured-data";
import { TshirtPrices } from "./TshirtPrices";
vi.mock("./DesignImage", () => ({ DesignImage: ({ src, alt }: {src: string; alt: string}) => createElement("img", {src, alt}) }));

const design = { id: "123", slug: "basket", title: "Basket", description: "Basket artwork" } as Design;
const offers: TshirtOffer[] = [{
  platform: "redbubble", seller: "Redbubble", name: "Basket Classic T-Shirt",
  url: "https://www.redbubble.com/i/t-shirt/Basket/185112811/lrcw", price: "26.21", currency: "EUR",
  image: "https://ih1.redbubble.net/tee.webp", availability: "https://schema.org/InStock",
  checkedAt: "2026-10-29T07:00:00Z", expiresAt: "2026-10-29T07:30:00Z",
}, {
  platform: "zazzle", seller: "Zazzle", name: "Basket T-Shirt", price: "18.24", currency: "USD",
  url: "https://www.zazzle.com/basket_t_shirt-256348287661201816",
  checkedAt: "2026-10-29T07:00:00Z", expiresAt: "2026-10-29T07:30:00Z",
}];

describe("verified T-shirt prices", () => {
  it("renders the exact primary product name and each marketplace's own currency", () => {
    const $ = load(renderToStaticMarkup(createElement(TshirtPrices, { offers, design, config: config as SiteConfig })));
    expect($("section").text()).toContain(offers[0].name);
    expect($("ul li").map((_, el) => $(el).text()).get()).toEqual(["Redbubble€26.21 EUR", "Zazzle$18.24 USD"]);
    expect($("img").attr("src")).toBe(offers[0].image);
    expect($("a").first().attr("href")).toBe(offers[1].url);
    expect($("a")).toHaveLength(1);
    expect($("a").first().attr("rel")).toContain("sponsored");
    expect($("section").text()).toContain("may earn a commission");
  });

  it("keeps a single concrete Product offer identical to the primary visible row", () => {
    const product = tshirtProductJsonLd("https://other.test/designs/basket", offers[0], design.description, "https://other.test/fallback.jpg");
    expect(product).toMatchObject({
      "@type": "Product", name: offers[0].name, image: offers[0].image,
      offers: { "@type": "Offer", price: offers[0].price, priceCurrency: offers[0].currency, url: offers[0].url, seller: { name: offers[0].seller } },
    });
    expect(product.offers).not.toHaveProperty("lowPrice");
    expect(product).not.toHaveProperty("aggregateRating");
    expect(JSON.stringify(product)).not.toContain("18.24");
  });

  it("does not render fictional prices when all sources are unavailable", () => {
    expect(renderToStaticMarkup(createElement(TshirtPrices, { offers: [], design, config: config as SiteConfig }))).toBe("");
  });
});
