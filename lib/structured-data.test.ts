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

  it("keeps content inside JSON-LD when a title contains a script closing tag", () => {
    const title = '</script><script>alert("bad")</script>';
    const $ = load(renderToStaticMarkup(createElement(JsonLd, {
      data: pageJsonLd({ domain: "other.test" }, "/", title),
    })));
    expect($("script")).toHaveLength(1);
    expect(JSON.parse($("script").text()).name).toBe(title);
  });
});
