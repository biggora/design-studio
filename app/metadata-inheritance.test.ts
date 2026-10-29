import type { ResolvingMetadata } from "next";
import { createDefaultMetadata } from "next/dist/lib/metadata/default-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import baseConfig from "@/config/config.json";

const { fetchDesigns } = vi.hoisted(() => ({ fetchDesigns: vi.fn() }));
vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => ({ ...baseConfig, name: "Other Studio", domain: "other.test" }),
  fetchPublishedArticles: async () => Array.from({ length: 13 }, () => ({})),
  fetchFeaturedCollections: async () => [],
  fetchLiveGiftPages: async () => [],
  fetchFeedCollections: async () => [],
  fetchDesigns,
}));

const ogImage = { url: "https://other.test/opengraph-image?v=original", width: 1200, height: 630, alt: "Site preview", type: "image/png" };
const twitterImage = { ...ogImage, url: "https://other.test/twitter-image?v=original" };
const inherited = {
  ...createDefaultMetadata(),
  openGraph: { title: { absolute: "Parent title", template: null }, url: null, siteName: "Other Studio", locale: "en_US", type: "website" as const, images: [ogImage] },
  twitter: { card: "summary_large_image" as const, site: null, siteId: null, creator: null, creatorId: null, description: null, title: { absolute: "Parent title", template: null }, images: [twitterImage] },
};
const parent: ResolvingMetadata = Promise.resolve(inherited);

beforeEach(() => fetchDesigns.mockResolvedValue({ designs: [], total: 0 }));

describe("page metadata inheritance", () => {
  it.each([
    "about", "services", "contact", "privacy-policy", "terms-of-service",
    "disclosure", "collections", "gifts", "publisher-privacy", "articles",
  ])("/%s preserves the inherited preview while overriding page identity", async (page) => {
    const { generateMetadata } = await import(`./${page}/page.tsx`);
    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) }, parent);
    expect(metadata.openGraph).toMatchObject({
      url: `https://other.test/${page}`, type: "website",
      title: metadata.title, description: metadata.description,
      siteName: "Other Studio", locale: "en_US", images: [ogImage],
    });
    if (metadata.twitter) {
      expect(metadata.twitter).toMatchObject({
        card: "summary_large_image", images: [twitterImage],
        title: metadata.title, description: metadata.description,
      });
    }
    expect(inherited.openGraph.title.absolute).toBe("Parent title");
  });

  it("keeps the articles page number in both canonical and og:url", async () => {
    const { generateMetadata } = await import("./articles/page");
    const metadata = await generateMetadata({ searchParams: Promise.resolve({ page: "2" }) }, parent);
    expect(metadata.alternates?.canonical).toBe("https://other.test/articles?page=2");
    expect(metadata.openGraph?.url).toBe(metadata.alternates?.canonical);
    expect(metadata.openGraph?.title).toBe("Articles — Page 2 | Other Studio");
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it("uses inherited images for empty search results without changing noindex", async () => {
    const { generateMetadata } = await import("./designs/page");
    const metadata = await generateMetadata({ searchParams: Promise.resolve({ search: "nothing" }) }, parent);
    expect(metadata.openGraph?.images).toEqual([ogImage]);
    expect(metadata.twitter?.images).toEqual([twitterImage]);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe("/designs");
  });

  it("keeps catalog artwork instead of replacing it with the site preview", async () => {
    fetchDesigns.mockResolvedValue({ designs: [{ externalImageUrl: "https://example.redbubble.net/artwork.jpg" }], total: 1 });
    const { generateMetadata } = await import("./designs/page");
    const metadata = await generateMetadata({ searchParams: Promise.resolve({}) }, parent);
    expect(metadata.openGraph?.images).toEqual(["https://example.redbubble.net/artwork.jpg"]);
    expect(metadata.twitter?.images).toEqual(metadata.openGraph?.images);
  });
});
