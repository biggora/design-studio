import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { afterEach, describe, expect, it, vi } from "vitest";
import defaults from "@/config/config.json";
import type { Design } from "@/types/design";

const designs = Array.from({ length: 6 }, (_, index) => ({
  id: `print-${index}`, slug: `print-${index}`, title: `Print ${index}`,
  description: "A print", collection: "", backgroundColor: "#ffffff", props: {},
  cdnImage: [{ key: `designs/print-${index}`, kind: "flat-full", version: 1, width: 1122, height: 1402 }],
})) as Design[];

vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => defaults,
  fetchDesigns: async () => ({ designs, total: designs.length }),
  fetchFeedCollections: async () => [],
  fetchFeaturedCollections: async () => [],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/components/TrackCatalogState", () => ({ default: () => null }));

afterEach(() => vi.unstubAllEnvs());

describe("catalog image loading", () => {
  it("starts the first-screen CDN images eagerly while keeping later results lazy", async () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://images.example.test");
    const { default: Catalog } = await import("./page");
    const $ = load(renderToStaticMarkup(await Catalog({ searchParams: Promise.resolve({}) })));
    const images = $("img").toArray();

    expect(images).toHaveLength(6);
    for (const image of images.slice(0, 4)) {
      expect($(image).attr("loading")).toBe("eager");
      expect($(image).attr("fetchpriority")).toBe("high");
    }
    for (const image of images.slice(4)) {
      expect($(image).attr("loading")).toBe("lazy");
      expect($(image).attr("fetchpriority")).toBeUndefined();
    }
    expect(images.every(image => $(image).attr("src")?.startsWith("https://images.example.test/"))).toBe(true);
  });
});
