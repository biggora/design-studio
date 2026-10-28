import { describe, expect, it, vi, beforeEach } from "vitest";
import { Design } from "@/types/design";

const getSiteConfig = vi.fn();
const fetchGiftFeedDesigns = vi.fn();

vi.mock("@/utils/database", () => ({
  getSiteConfig: () => getSiteConfig(),
  fetchGiftFeedDesigns: (...args: unknown[]) => fetchGiftFeedDesigns(...args),
}));

function makeDesign(id: string): Design {
  return {
    id, externalId: 1, title: `Design ${id}`, slug: `design-${id}`, externalLink: "https://www.redbubble.com/shop/ap/1",
    externalImageUrl: "https://ih1.redbubble.com/image.jpg", category: "", collection: "Cats", imageName: "",
    description: "A design.", keywords: "", backgroundColors: "", backgroundColor: "#FFFFFF",
    createdAt: "2026-10-07T08:10:00.000Z", updatedAt: "2026-10-08T09:00:00.000Z", props: {},
  };
}

const gift = {
  slug: "cat-lovers", title: "Gifts for Cat Lovers", description: "Prints for cat people.", intro: "I",
  sections: [{ collection: "Cats", heading: "H" }, { collection: "Pets", heading: "H" }],
};

async function callRoute(giftSlug: string): Promise<Response> {
  const { GET } = await import("@/app/feeds/gifts/[giftSlug]/route");
  return GET(new Request(`https://threadquirk.test/feeds/gifts/${giftSlug}`), { params: Promise.resolve({ giftSlug }) });
}

beforeEach(() => {
  getSiteConfig.mockReset().mockResolvedValue({ name: "ThreadQuirk", domain: "threadquirk.test", giftPages: [gift] });
  fetchGiftFeedDesigns.mockReset().mockResolvedValue({ designs: [], earliestListingAt: {} });
});

describe("/feeds/gifts/[giftSlug].xml", () => {
  it("serves the designs of all section collections with the gift channel", async () => {
    fetchGiftFeedDesigns.mockResolvedValue({
      designs: [makeDesign("a"), makeDesign("b")],
      earliestListingAt: { a: "2026-10-06T07:00:00.000Z" },
    });
    const response = await callRoute("cat-lovers");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/xml; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");
    expect(fetchGiftFeedDesigns).toHaveBeenCalledWith(gift, 100);
    const xml = await response.text();
    expect(xml).toContain("<title>ThreadQuirk – Gifts for Cat Lovers</title>");
    expect(xml).toContain("<link>https://threadquirk.test/gifts/cat-lovers</link>");
    expect(xml).toContain("<description>Prints for cat people.</description>");
    expect(xml.indexOf("design-a")).toBeLessThan(xml.indexOf("design-b"));
    expect((xml.match(/<item>/g) || []).length).toBe(2);
    expect(xml).toContain("<pubDate>Tue, 06 Oct 2026 07:00:00 GMT</pubDate>");
  });

  it("uses the heading in the channel title when the page has one", async () => {
    getSiteConfig.mockResolvedValue({ name: "ThreadQuirk", domain: "threadquirk.test", giftPages: [{ ...gift, heading: "Cat Gift Ideas" }] });
    expect(await (await callRoute("cat-lovers")).text()).toContain("<title>ThreadQuirk – Cat Gift Ideas</title>");
  });

  it("caps the feed at 100 items", async () => {
    fetchGiftFeedDesigns.mockResolvedValue({
      designs: Array.from({ length: 150 }, (_, i) => makeDesign(`id-${i}`)), earliestListingAt: {},
    });
    expect(((await (await callRoute("cat-lovers")).text()).match(/<item>/g) || []).length).toBe(100);
  });

  it("serves a well-formed empty channel for a known page without designs", async () => {
    const response = await callRoute("cat-lovers");
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).toContain("<channel>");
    expect(xml).toContain("</rss>");
    expect(xml).not.toContain("<item>");
  });

  it("404s for an unknown gift slug", async () => {
    const response = await callRoute("nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("maps the .xml URL onto the handler through the Next rewrite", async () => {
    const { default: nextConfig } = await import("@/next.config.mjs");
    const rewrites = (await nextConfig.rewrites?.()) as { source: string; destination: string }[];
    expect(rewrites).toContainEqual({ source: "/feeds/gifts/:giftSlug.xml", destination: "/feeds/gifts/:giftSlug" });
  });
});
