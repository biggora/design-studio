import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const fetchDesigns = vi.fn();
const config = {
  name: "Example Studio", domain: "example.test",
  collectionPages: [{collection: "Programming", title: "Coding Prints & Gifts", heading: "Programming Prints",
    description: "Coding jokes and debugging designs for programmers.",
    intro: "Choose a coding joke or a debugging design for your next developer gift."}],
};
vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => config,
  fetchDesigns: (...args: unknown[]) => fetchDesigns(...args),
  fetchCollections: async () => ["Programming", "Photography"],
  fetchFeedCollections: async () => [{title: "Programming", description: "Database introduction"}, {title: "Photography", description: "Camera and lens artwork for photographers."}],
  fetchFeaturedCollections: async () => [{...config.collectionPages[0], total: 22}],
}));
vi.mock("next/navigation", () => ({redirect: vi.fn()}));
vi.mock("next/link", () => ({default: ({children, ...props}: React.ComponentProps<"a">) => <a {...props}>{children}</a>}));
vi.mock("@/app/components/CatalogSearchBar", () => ({CatalogSearchBar: () => <div>Search</div>}));
vi.mock("@/app/components/TrackCatalogState", () => ({default: () => null}));
vi.mock("@/app/components/DesignCard", () => ({DesignCard: () => <article>Print</article>}));

beforeEach(() => fetchDesigns.mockReset().mockResolvedValue({designs: [], total: 22}));

describe("collection catalog pages", () => {
  it("uses configured collection copy in metadata and a self-canonical on page two", async () => {
    const {generateMetadata} = await import("./page");
    const metadata = await generateMetadata({searchParams: Promise.resolve({collection: "Programming", page: "2"})});
    expect(metadata.title).toBe("Coding Prints & Gifts - Example Studio - Page 2");
    expect(metadata.description).toBe(config.collectionPages[0].description);
    expect(metadata.alternates?.canonical).toBe("/designs?collection=Programming&page=2");
    expect(metadata.openGraph?.url).toBe("https://example.test/designs?collection=Programming&page=2");
    expect(metadata.robots).toBeUndefined();
  });

  it("renders the collection heading, introduction and crawlable links", async () => {
    const {default: Page} = await import("./page");
    const html = renderToStaticMarkup(await Page({searchParams: Promise.resolve({collection: "Programming"})}));
    expect(html).toContain("Programming Prints</h1>");
    expect(html).toContain(config.collectionPages[0].intro);
    expect(html).toContain('href="/designs?collection=Programming"');
  });

  it("describes collection, catalog and search pages with their visible designs", async () => {
    const {default: Page} = await import("./page");
    fetchDesigns.mockResolvedValue({designs: [{id: "1", slug: "one", title: "One"}], total: 22});
    const html = renderToStaticMarkup(await Page({searchParams: Promise.resolve({collection: "Programming"})}));
    const ld = JSON.parse(html.split('<script type="application/ld+json">')[1].split("</script>")[0]);
    expect(ld).toMatchObject({
      "@type": "CollectionPage", name: "Programming Prints", url: "https://example.test/designs?collection=Programming",
      mainEntity: {"@type": "ItemList", itemListElement: [{position: 1, url: "https://example.test/designs/one"}]},
    });
    const catalog = renderToStaticMarkup(await Page({searchParams: Promise.resolve({})}));
    expect(catalog).toContain('"@type":"CollectionPage"');
    expect(catalog).toContain('"name":"Our Designs"');
    const search = renderToStaticMarkup(await Page({searchParams: Promise.resolve({search: "cat"})}));
    expect(search).toContain('"@type":"SearchResultsPage"');
    expect(search).toContain('"url":"https://example.test/designs?search=cat"');
    fetchDesigns.mockResolvedValue({designs: [], total: 0});
    const empty = renderToStaticMarkup(await Page({searchParams: Promise.resolve({})}));
    expect(empty).not.toContain("CollectionPage");
    expect(empty).toContain('"@type":"WebPage"');
  });

  it("uses database copy for other real collections", async () => {
    const {generateMetadata} = await import("./page");
    const metadata = await generateMetadata({searchParams: Promise.resolve({collection: "Photography"})});
    expect(metadata.title).toBe("Photography - Example Studio");
    expect(metadata.description).toBe("Camera and lens artwork for photographers.");
  });

  it("keeps searches and empty/unknown collection results out of the index", async () => {
    const {generateMetadata} = await import("./page");
    expect((await generateMetadata({searchParams: Promise.resolve({collection: "Programming", search: "cat"})})).robots)
      .toEqual({index: false, follow: true});
    fetchDesigns.mockResolvedValue({designs: [], total: 0});
    for (const collection of ["Programming", "Unknown"]) {
      expect((await generateMetadata({searchParams: Promise.resolve({collection})})).robots)
        .toEqual({index: false, follow: true});
    }
  });
});
