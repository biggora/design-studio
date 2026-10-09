import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { Design } from "@/types/design";
import config from "@/config/config.json";
import BuyLink, { BuyLinkProps } from "@/app/components/BuyLink";

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

// Collects the BuyLink client islands in a page element's tree, in render order.
function findBuyLinks(node: unknown): ReactElement<BuyLinkProps>[] {
  const found: ReactElement<BuyLinkProps>[] = [];
  const visit = (child: unknown) => {
    if (Array.isArray(child)) {
      child.forEach(visit);
      return;
    }
    if (!child || typeof child !== "object") return;
    const el = child as { type?: unknown; props?: { children?: unknown } };
    if (el.type === BuyLink) found.push(child as ReactElement<BuyLinkProps>);
    if (el.props && typeof el.props === "object") visit(el.props.children);
  };
  visit(node);
  return found;
}

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
  it("wires the TeePublic button with its GA4 buy_click parameters", async () => {
    const page = await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) });
    const buyLinks = findBuyLinks(page);
    expect(buyLinks).toHaveLength(1);
    expect(buyLinks[0].props).toMatchObject({
      href: "https://teepublic.com/t-shirt/123-space-cat",
      platform: "teepublic",
      designSlug: "space-cat",
      pageType: "design",
      position: "secondary",
    });
  });
  it("generates metadata with the stable design path", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "space-cat" }) });
    expect(metadata.alternates?.canonical).toBe("/designs/space-cat");
    expect(metadata.title).toContain("Space cat");
    expect(String(metadata.title).length).toBeLessThanOrEqual(60);
    expect(metadata.description?.length).toBeLessThanOrEqual(160);
    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.twitter).not.toHaveProperty("images");
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });
});
