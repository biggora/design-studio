import { describe, expect, it, vi, beforeEach } from "vitest";

const getSiteConfig = vi.fn();
const fetchFeedCollections = vi.fn();
const fetchCollectionFeedDesigns = vi.fn();

vi.mock("@/utils/database", () => ({
  getSiteConfig: () => getSiteConfig(),
  fetchFeedCollections: () => fetchFeedCollections(),
  fetchCollectionFeedDesigns: (title: string, limit: number) =>
    fetchCollectionFeedDesigns(title, limit),
}));

beforeEach(() => {
  getSiteConfig.mockReset().mockResolvedValue({ name: "ThreadQuirk", domain: "threadquirk.test" });
  fetchFeedCollections.mockReset();
  fetchCollectionFeedDesigns.mockReset();
});

describe("/feeds/pinterest.xml index", () => {
  it("lists every collection feed with its URL, board name and item count", async () => {
    fetchFeedCollections.mockResolvedValue([
      { title: "Cats", description: "Feline friends" },
      { title: "Bugs, Tests and Hallucinations", description: "" },
    ]);
    fetchCollectionFeedDesigns.mockImplementation(async (title: string) => ({
      designs: Array.from({ length: title === "Cats" ? 7 : 0 }, (_, i) => ({ id: `d${i}` })),
      earliestListingAt: {},
    }));

    const { GET } = await import("@/app/feeds/pinterest.xml/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/xml; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");

    const xml = await response.text();
    expect(xml).toContain("<title>ThreadQuirk – Pinterest feed index</title>");
    expect(xml).toContain(
      "<link>https://threadquirk.test/feeds/pinterest/cats.xml</link>",
    );
    expect(xml).toContain(
      "<link>https://threadquirk.test/feeds/pinterest/bugs-tests-and-hallucinations.xml</link>",
    );
    expect(xml).toContain("Pinterest board: Cats");
    expect(xml).toContain("7 designs");
    // Sorted by title, so Bugs comes before Cats.
    expect(xml.indexOf("bugs-tests-and-hallucinations")).toBeLessThan(
      xml.indexOf("/feeds/pinterest/cats.xml"),
    );

    const urls = [
      ...xml.matchAll(/<link>([^<]+)<\/link>|(?:href|url)="([^"]+)"/g),
    ]
      .map(match => match[1] || match[2])
      .filter(value => value.startsWith("http"));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(new URL(url).hostname).toBe("threadquirk.test");
    }
  });
});
