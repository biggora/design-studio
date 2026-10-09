import { describe, expect, it, vi, beforeEach } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { Design } from "@/types/design";

const getSiteConfig = vi.fn();
const fetchDesigns = vi.fn();

vi.mock("@/utils/database", () => ({
  getSiteConfig: () => getSiteConfig(),
  fetchDesigns: (page: number, q: string, collection: string, itemsPerPage: number) =>
    fetchDesigns(page, q, collection, itemsPerPage),
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
    description: "A bold typographic space graphic.",
    keywords: "astronaut,space",
    backgroundColors: "",
    backgroundColor: "#D2E4FF",
    createdAt: "2026-10-07T08:10:00.000Z",
    updatedAt: "2026-10-08T09:00:00.000Z",
    props: {},
    ...overrides,
  };
}

beforeEach(() => {
  getSiteConfig.mockReset().mockResolvedValue({ name: "ThreadQuirk", domain: "threadquirk.test" });
  // One page of designs; the loop stops when a page comes back short.
  fetchDesigns.mockReset().mockResolvedValue({
    designs: [makeDesign(), makeDesign({ id: "id-2", slug: "second-design" })],
    total: 2,
  });
});

describe("/sitemap.xml", () => {
  it("serves the sitemap protocol document with the stylesheet PI", async () => {
    const { GET } = await import("@/app/sitemap.xml/route");
    const response = await GET();
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });

  it("lists the static routes and every design with lastmod", async () => {
    const { GET } = await import("@/app/sitemap.xml/route");
    const xml = await (await GET()).text();

    expect((xml.match(/<url>/g) || []).length).toBe(10); // 8 static + 2 designs
    expect(xml).toContain("<loc>https://threadquirk.test/</loc>");
    expect(xml).toContain("<loc>https://threadquirk.test/disclosure</loc>");
    expect(xml).toContain("<loc>https://threadquirk.test/designs/look-past-the-stars-astronaut-design</loc>");
    expect(xml).toContain("<lastmod>2026-10-07</lastmod>");
    expect(xml).toContain("<changefreq>monthly</changefreq>");
    expect(xml).toContain("<priority>1</priority>");
    expect(xml).toContain("<priority>0.5</priority>");
  });

  it("escapes XML-significant characters in URLs", async () => {
    getSiteConfig.mockResolvedValue({
      name: "ThreadQuirk",
      domain: "threadquirk.test",
    });
    fetchDesigns.mockResolvedValue({
      designs: [makeDesign({ slug: "cats-&-dogs" })],
      total: 1,
    });

    const { GET } = await import("@/app/sitemap.xml/route");
    const xml = await (await GET()).text();
    expect(xml).toContain("<loc>https://threadquirk.test/designs/cats-&amp;-dogs</loc>");
  });

  it("stops paginating once the fetched page is short", async () => {
    fetchDesigns.mockResolvedValue({ designs: [makeDesign()], total: 1 });
    const { GET } = await import("@/app/sitemap.xml/route");
    await GET();
    expect(fetchDesigns).toHaveBeenCalledTimes(1);
  });

  it("stylesheet exists in public/ where the PI points", () => {
    expect(existsSync(join(process.cwd(), "public", "sitemap.xsl"))).toBe(true);
  });
});
