import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { expect, it, vi } from "vitest";
import config from "@/config/config.json";

vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => ({ ...config, name: "Other Studio", domain: "other.test" }),
}));

it.each([
  ["about", "AboutPage"], ["contact", "ContactPage"], ["services", "WebPage"],
  ["privacy-policy", "WebPage"], ["terms-of-service", "WebPage"],
  ["disclosure", "WebPage"], ["publisher-privacy", "WebPage"],
])("/%s renders the appropriate page schema without changing the visible heading", async (path, type) => {
  const { default: Page } = await import(`./${path}/page.tsx`);
  const $ = load(renderToStaticMarkup(await Page()));
  expect($("h1")).toHaveLength(1);
  const data = JSON.parse($('script[type="application/ld+json"]').text());
  expect(data).toMatchObject({
    "@context": "https://schema.org", "@type": type,
    "@id": `https://other.test/${path}#webpage`, url: `https://other.test/${path}`,
    isPartOf: { "@id": "https://other.test/#website" },
    publisher: { "@id": "https://other.test/#organization" },
  });
  if (path === "about" || path === "contact") {
    expect(data.mainEntity).toEqual({ "@id": "https://other.test/#organization" });
  }
});
