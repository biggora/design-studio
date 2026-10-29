import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import { pageJsonLd } from "./structured-data";
import { JsonLd } from "@/app/components/JsonLd";

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
});
