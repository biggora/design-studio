import { describe, expect, it, vi } from "vitest";

const fetchGiftFeedDesigns = vi.fn();
const giftPages = [
  { slug: "cat-lovers", title: "Gifts for Cat Lovers", heading: "Cat Gift Ideas", description: "Prints for cat people.", intro: "I",
    sections: [{ collection: "Cats", heading: "H" }] },
  { slug: "coders", title: "Gifts for Coders", description: "Coding prints.", intro: "I",
    sections: [{ collection: "Programming", heading: "H" }] },
];
vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => ({ name: "ThreadQuirk", domain: "threadquirk.test", giftPages }),
  fetchGiftFeedDesigns: (...args: unknown[]) => fetchGiftFeedDesigns(...args),
}));

describe("/feeds/gifts.xml", () => {
  it("lists every gift page feed with its item count and no Pinterest wording", async () => {
    fetchGiftFeedDesigns.mockImplementation(async (page: {slug: string}) => ({
      designs: page.slug === "cat-lovers" ? [{}, {}, {}] : [], earliestListingAt: {},
    }));
    const { GET } = await import("@/app/feeds/gifts.xml/route");
    const response = await GET();
    expect(response.headers.get("Content-Type")).toBe("text/xml; charset=utf-8");
    const xml = await response.text();
    expect(xml).toContain("<link>https://threadquirk.test/feeds/gifts/cat-lovers.xml</link>");
    expect(xml).toContain("<link>https://threadquirk.test/feeds/gifts/coders.xml</link>");
    expect(xml).toContain("<title>ThreadQuirk – Cat Gift Ideas</title>");
    expect(xml).toContain("3 designs. Prints for cat people.");
    expect(xml).toContain("0 designs. Coding prints.");
    expect(xml).not.toContain("Pinterest board");
    expect((xml.match(/<item>/g) || []).length).toBe(2);
  });
});
