import { describe, expect, it, vi, beforeEach } from "vitest";

const getSiteConfig = vi.fn();
const fetchFeedCollections = vi.fn();
const fetchCollectionFeedDesigns = vi.fn();

vi.mock("@/utils/database", () => ({
  getSiteConfig: () => getSiteConfig(),
  fetchFeedCollections: () => fetchFeedCollections(),
  fetchCollectionFeedDesigns: (title: string, limit: number, feedCollections: unknown) =>
    fetchCollectionFeedDesigns(title, limit, feedCollections),
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

  it("reports each feed's own item count, in the same feed order and URLs as before", async () => {
    const collections = [
      { title: "Space", description: "" },
      { title: "Cats", description: "" },
      { title: "Dogs", description: "" },
    ];
    fetchFeedCollections.mockResolvedValue(collections);
    const countsByTitle: Record<string, number> = { Space: 3, Cats: 12, Dogs: 0 };
    fetchCollectionFeedDesigns.mockImplementation(async (title: string) => ({
      designs: Array.from({ length: countsByTitle[title] }, (_, i) => ({ id: `${title}-${i}` })),
      earliestListingAt: {},
    }));

    const { GET } = await import("@/app/feeds/pinterest.xml/route");
    const xml = await (await GET()).text();

    // Each feed is queried with the full collection list so designs are split across feeds.
    expect(fetchCollectionFeedDesigns).toHaveBeenCalledTimes(3);
    for (const { title } of collections) {
      expect(fetchCollectionFeedDesigns).toHaveBeenCalledWith(title, 100, collections);
    }

    // Items are sorted by title (Cats, Dogs, Space), each with its own count and URL.
    const items = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)].map(match => match[0]);
    expect(items).toHaveLength(3);
    expect(items[0]).toContain("<link>https://threadquirk.test/feeds/pinterest/cats.xml</link>");
    expect(items[0]).toContain("Pinterest board: Cats");
    expect(items[0]).toContain("12 designs");
    expect(items[1]).toContain("<link>https://threadquirk.test/feeds/pinterest/dogs.xml</link>");
    expect(items[1]).toContain("Pinterest board: Dogs");
    expect(items[1]).toContain("0 designs");
    expect(items[2]).toContain("<link>https://threadquirk.test/feeds/pinterest/space.xml</link>");
    expect(items[2]).toContain("Pinterest board: Space");
    expect(items[2]).toContain("3 designs");
  });
});
