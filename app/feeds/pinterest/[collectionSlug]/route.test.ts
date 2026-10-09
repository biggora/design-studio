import { describe, expect, it, vi, beforeEach } from "vitest";
import { Design } from "@/types/design";

const getSiteConfig = vi.fn();
const fetchFeedCollections = vi.fn();
const fetchCollectionFeedDesigns = vi.fn();

vi.mock("@/utils/database", () => ({
  getSiteConfig: () => getSiteConfig(),
  fetchFeedCollections: () => fetchFeedCollections(),
  fetchCollectionFeedDesigns: (title: string, limit: number) =>
    fetchCollectionFeedDesigns(title, limit),
}));

function makeDesign(overrides: Partial<Design> = {}): Design {
  return {
    id: "c4e49734-7bb5-46f4-86c8-7ec6a587c128",
    externalId: 184507566,
    title: "Look Past the Stars Astronaut Design",
    slug: "look-past-the-stars-astronaut-design",
    externalLink: "https://www.redbubble.com/shop/ap/184507566",
    externalImageUrl: "https://ih1.redbubble.com/image.jpg",
    category: "no_category",
    collection: "Space Shirts",
    imageName: "",
    description: "A bold typographic space graphic featuring an explorer with a telescope.",
    keywords: "astronaut,space",
    backgroundColors: "",
    backgroundColor: "#D2E4FF",
    createdAt: "2026-10-07T08:10:00.000Z",
    updatedAt: "2026-10-08T09:00:00.000Z",
    props: {},
    ...overrides,
  };
}

async function callRoute(collectionSlug: string): Promise<Response> {
  const { GET } = await import("@/app/feeds/pinterest/[collectionSlug]/route");
  return GET(new Request(`https://threadquirk.test/feeds/pinterest/${collectionSlug}.xml`), {
    params: Promise.resolve({ collectionSlug }),
  });
}

beforeEach(() => {
  getSiteConfig.mockReset().mockResolvedValue({ name: "ThreadQuirk", domain: "threadquirk.test" });
  fetchFeedCollections.mockReset();
  fetchCollectionFeedDesigns.mockReset();
});

describe("/feeds/pinterest/[collectionSlug].xml", () => {
  it("serves the collection's designs as RSS 2.0 with exactly one media:content per item", async () => {
    fetchFeedCollections.mockResolvedValue([
      { title: "Bugs, Tests and Hallucinations", description: "Tech memes" },
      { title: "Cats", description: "" },
    ]);
    const designs = [
      makeDesign(),
      makeDesign({
        id: "00000000-0000-0000-0000-000000000002",
        slug: "second-design",
        title: "Second Design",
        props: { teepublicLink: "https://www.teepublic.com/t-shirt/1-second" },
      }),
    ];
    fetchCollectionFeedDesigns.mockResolvedValue({
      designs,
      earliestListingAt: { [designs[0].id]: "2026-10-06T07:00:00.000Z" },
    });

    const response = await callRoute("bugs-tests-and-hallucinations");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");
    expect(fetchCollectionFeedDesigns).toHaveBeenCalledWith("Bugs, Tests and Hallucinations", 100);

    const xml = await response.text();
    expect(xml).toContain('<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">');
    expect(xml).toContain("<title>ThreadQuirk – Bugs, Tests and Hallucinations</title>");
    expect(xml).toContain("<language>en</language>");
    expect((xml.match(/<item>/g) || []).length).toBe(2);
    expect((xml.match(/<media:content /g) || []).length).toBe(2);
    expect((xml.match(/<enclosure/g) || []).length).toBe(0);
    expect(xml).toContain(
      `<guid isPermaLink="true">https://threadquirk.test/p/look-past-the-stars-astronaut-design</guid>`,
    );
    expect(xml).toMatch(
      /<media:content url="https:\/\/threadquirk\.test\/p\/look-past-the-stars-astronaut-design\/pin\.jpg\?v=[0-9a-f]{6}" medium="image" type="image\/jpeg" width="1000" height="1500"\/>/,
    );
    // Listing pubDate wins over createdAt.
    expect(xml).toContain("<pubDate>Tue, 06 Oct 2026 07:00:00 GMT</pubDate>");

    // Every URL Pinterest could act on anywhere in the feed is on the claimed domain.
    const urls = [
      ...xml.matchAll(/<link>([^<]+)<\/link>|(?:href|url)="([^"]+)"/g),
    ].map(match => match[1] || match[2]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(new URL(url).hostname).toBe("threadquirk.test");
    }
  });

  it("caps the feed at the 100 most recent designs", async () => {
    fetchFeedCollections.mockResolvedValue([{ title: "Cats", description: "" }]);
    const designs = Array.from({ length: 150 }, (_, i) =>
      makeDesign({ id: `id-${i}`, slug: `design-${i}`, title: `Design ${i}` }),
    );
    fetchCollectionFeedDesigns.mockResolvedValue({ designs, earliestListingAt: {} });

    const response = await callRoute("cats");
    const xml = await response.text();
    expect((xml.match(/<item>/g) || []).length).toBe(100);
  });

  it("404s for an unknown collection slug", async () => {
    fetchFeedCollections.mockResolvedValue([{ title: "Cats", description: "" }]);
    const response = await callRoute("no-such-collection");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
