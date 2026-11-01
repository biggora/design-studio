import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { designListElements, pageJsonLd, tshirtProductJsonLd } from "./structured-data";
import type { TshirtOffer } from "./marketplace-prices";
import type { Design } from "@/types/design";
import { JsonLd } from "@/app/components/JsonLd";

const offer: TshirtOffer = { platform: "redbubble", seller: "Redbubble", name: "Basket Classic T-Shirt", url: "https://www.redbubble.com/i/t-shirt/Basket/123/lrcw", price: "26.21", currency: "EUR", checkedAt: "2026-10-29T07:00:00Z", expiresAt: "2026-10-30T19:00:00Z" };

describe("structured page data", () => {
  it("uses deployment identity and distinct page identities including pagination", () => {
    const data = pageJsonLd({ domain: "other.test" }, "/articles?page=2", "Articles", "CollectionPage");
    expect(data).toMatchObject({
      "@id": "https://other.test/articles?page=2#webpage", url: "https://other.test/articles?page=2",
      isPartOf: { "@id": "https://other.test/#website" },
      publisher: { "@id": "https://other.test/#organization" }, inLanguage: "en",
    });
    expect(pageJsonLd({ domain: "other.test" }, "/", "Home")["@id"]).toBe("https://other.test/#webpage");
  });

  it("includes a complete breadcrumb on inner pages while leaving home without one", () => {
    const data = pageJsonLd({ domain: "other.test" }, "/articles?page=2", "Articles", "CollectionPage");
    expect(data).toHaveProperty("breadcrumb", {
      "@type": "BreadcrumbList", "@id": "https://other.test/articles?page=2#breadcrumb",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://other.test/" },
        { "@type": "ListItem", position: 2, name: "Articles", item: "https://other.test/articles?page=2" },
      ],
    });
    expect(pageJsonLd({ domain: "other.test" }, "/", "Home")).not.toHaveProperty("breadcrumb");
  });

  it("keeps content inside JSON-LD when a title contains a script closing tag", () => {
    const title = '</script><script>alert("bad")</script>';
    const $ = load(renderToStaticMarkup(createElement(JsonLd, {
      data: pageJsonLd({ domain: "other.test" }, "/", title),
    })));
    expect($("script")).toHaveLength(1);
    expect(JSON.parse($("script").text()).name).toBe(title);
  });

  it("names the site as the Product brand without inventing identifiers, shipping or returns", () => {
    const product = tshirtProductJsonLd("https://other.test/designs/basket", offer, "Print", "https://other.test/a.jpg", "Other Brand");
    expect(product.brand).toEqual({ "@type": "Brand", name: "Other Brand" });
    for (const key of ["gtin", "mpn", "aggregateRating", "review", "shippingDetails", "hasMerchantReturnPolicy"]) {
      expect(product).not.toHaveProperty(key);
      expect(product.offers).not.toHaveProperty(key);
    }
  });

  it("carries the same brand on every complete list Product", () => {
    const designs = Array.from({ length: 3 }, (_, i) => ({ id: `d${i}`, title: `Print ${i}`, description: "Print", externalImageUrl: "https://ih1.redbubble.net/print.jpg", props: {} } as Design));
    const list = designListElements(designs, "https://other.test", new Map(designs.map(design => [design.id, offer])), "Other Brand");
    expect(list).toHaveLength(3);
    for (const entry of list) expect(entry.item?.brand).toEqual({ "@type": "Brand", name: "Other Brand" });
  });
});
