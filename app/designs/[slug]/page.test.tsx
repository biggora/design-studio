import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Design } from "@/types/design";
import config from "@/config/config.json";

const design: Design = {
  id: "123e4567-e89b-12d3-a456-426614174000", slug: "space-cat", externalId: null,
  title: "Space cat", description: "Cat in space", keywords: "cat,space", category: "",
  collection: "", imageName: "", externalLink: "", externalImageUrl: "",
  backgroundColor: "#000000", backgroundColors: "", createdAt: "2026-10-07T08:10:00Z", updatedAt: "",
  props: { teepublicLink: "https://teepublic.com/t-shirt/123-space-cat" },
};
vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => config,
  getDesignBySlug: async () => ({ design, relatedDesigns: [] }),
  getDesignById: async () => ({ design, relatedDesigns: [] }),
}));
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));
vi.mock("@/app/components/FeaturedDesigns", () => ({ default: () => null }));
vi.mock("@/app/components/BackToCatalog", () => ({ default: () => null }));
vi.mock("@/app/components/ShareLinks", () => ({ default: () => null }));
import DesignDetails, { generateMetadata } from "@/app/designs/[slug]/page";

describe("non-Redbubble design page", () => {
  it("renders the placeholder and TeePublic link without a bogus Redbubble button", async () => {
    const page = await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Space cat");
    expect(html).toContain("/images/no_image_available.svg");
    expect(html).toContain("Buy on TeePublic");
    expect(html).not.toContain("Buy on Redbubble");
    expect(html).not.toContain("shop/ap/null");
    expect(html).toContain("/disclosure");
  });
  it("generates metadata with the stable design path", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "space-cat" }) });
    expect(metadata.alternates?.canonical).toBe("/designs/space-cat");
    expect(metadata.title).toContain("Space cat");
  });
});
