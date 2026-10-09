import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { Design } from "@/types/design";
import BuyLink, { BuyLinkProps } from "@/app/components/BuyLink";

const getSiteConfig = vi.fn();
const getDesignBySlug = vi.fn();
const getDesignById = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/utils/database", () => ({
  getSiteConfig: () => getSiteConfig(),
  getDesignBySlug: (slug: string) => getDesignBySlug(slug),
  getDesignById: (id: string) => getDesignById(id),
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

// The mobile viewport budget this layout must satisfy (see the above-the-fold test).
const VIEWPORT_HEIGHT = 844;
const HEADER_HEIGHT = 64;
// Image: full column width (390 − 2×16px padding) in the mockup's 3:4 shape.
const IMAGE_HEIGHT = Math.round(((390 - 32) * 4) / 3); // 477
const TITLE_TWO_LINES = 60; // text-2xl leading-tight, 2 clamped lines
const BUTTON_HEIGHT = 48; // px-6 py-2 at text-base
const DISCLOSURE_HEIGHT = 40; // two wrapped text-sm lines
const VERTICAL_MARGINS = 16 + 16 + 12 + 12 + 24; // title mt + primary mt + secondary mt + disclosure mt + page pt

const config = {
  name: "ThreadQuirk",
  domain: "threadquirk.test",
  affiliate: {
    redbubbleTemplate: "https://pxf.example/c/1/2/3?u={url}",
    teepublicReferralId: "ref-123",
  },
};

async function renderPage(slug: string): Promise<string> {
  const { default: PinLandingPage } = await import("@/app/p/[slug]/page");
  return renderToStaticMarkup(await PinLandingPage({ params: Promise.resolve({ slug }) }));
}

async function renderMetadata(slug: string) {
  const { generateMetadata } = await import("@/app/p/[slug]/page");
  return generateMetadata({ params: Promise.resolve({ slug }) });
}

// Collects the BuyLink client islands in a page element's tree, in render order.
async function renderBuyLinks(slug: string): Promise<ReactElement<BuyLinkProps>[]> {
  const { default: PinLandingPage } = await import("@/app/p/[slug]/page");
  const element = await PinLandingPage({ params: Promise.resolve({ slug }) });
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
  visit(element);
  return found;
}

beforeEach(() => {
  getSiteConfig.mockReset().mockResolvedValue(config);
  getDesignBySlug.mockReset();
  getDesignById.mockReset();
});

describe("/p/[slug] landing page", () => {
  it("renders image, title, buy buttons, disclosure and design link in order", async () => {
    const design = makeDesign({
      props: { teepublicLink: "https://www.teepublic.com/t-shirt/99914330-look-past-the-stars" },
    });
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });

    const html = await renderPage(design.slug as string);
    const titleIndex = html.indexOf(design.title);
    const imageIndex = html.indexOf("<img");
    const redbubbleIndex = html.indexOf("Buy on Redbubble");
    const teepublicIndex = html.indexOf("Buy on TeePublic");
    const disclosureIndex = html.indexOf("We may earn a commission");
    const moreIndex = html.indexOf("More about this design");

    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(titleIndex).toBeGreaterThan(imageIndex);
    expect(redbubbleIndex).toBeGreaterThan(titleIndex);
    expect(teepublicIndex).toBeGreaterThan(redbubbleIndex);
    expect(disclosureIndex).toBeGreaterThan(teepublicIndex);
    expect(moreIndex).toBeGreaterThan(disclosureIndex);
  });

  it("wraps both marketplace links with the affiliate tracking and required rel", async () => {
    const design = makeDesign({
      props: { teepublicLink: "https://www.teepublic.com/t-shirt/99914330-look-past-the-stars" },
    });
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });

    const html = await renderPage(design.slug as string);
    const encoded = encodeURIComponent("https://www.redbubble.com/shop/ap/184507566");
    expect(html).toContain(`href="https://pxf.example/c/1/2/3?u=${encoded}"`);
    expect(html).toContain(
      'href="https://www.teepublic.com/t-shirt/99914330-look-past-the-stars?ref_id=ref-123"',
    );
    expect((html.match(/rel="sponsored noopener noreferrer"/g) || []).length).toBe(2);
    expect((html.match(/target="_blank"/g) || []).length).toBe(2);
  });

  it("wires both buy buttons with their GA4 buy_click parameters", async () => {
    const design = makeDesign({
      props: { teepublicLink: "https://www.teepublic.com/t-shirt/99914330-look-past-the-stars" },
    });
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });

    const buyLinks = await renderBuyLinks(design.slug as string);
    expect(buyLinks).toHaveLength(2);
    expect(buyLinks[0].props).toMatchObject({
      platform: "redbubble",
      designSlug: design.slug,
      pageType: "landing",
      position: "primary",
    });
    expect(buyLinks[1].props).toMatchObject({
      platform: "teepublic",
      designSlug: design.slug,
      pageType: "landing",
      position: "secondary",
    });
  });

  it("links the disclosure line to /disclosure and the design page", async () => {
    const design = makeDesign();
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });

    const html = await renderPage(design.slug as string);
    expect(html).toContain('href="/disclosure"');
    expect(html).toContain(`href="/designs/${design.slug}"`);
    expect(html).toContain("More about this design");
  });

  it("renders the head: canonical points at the design page, noindex + follow, OG pin image", async () => {
    const design = makeDesign();
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });

    const metadata = await renderMetadata(design.slug as string);
    expect(metadata.alternates?.canonical).toBe(
      `https://threadquirk.test/designs/${design.slug}`,
    );
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.openGraph?.images).toEqual([
      expect.stringContaining(
        `https://threadquirk.test/p/${design.slug}/pin.jpg?v=`,
      ),
    ]);
    expect(metadata.openGraph?.title).toContain(design.title);
  });

  it("keeps both buttons above the fold on a 390×844 viewport", async () => {
    const design = makeDesign();
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });

    const html = await renderPage(design.slug as string);
    // The image spans the full column in the mockup's 3:4 shape and the title
    // is line-clamped, so the stack's height is bounded: header + image + title
    // + two buttons + disclosure all fit one mobile viewport.
    expect(html).toMatch(/aspect-\[3\/4\]/);
    expect(html).toMatch(/line-clamp-2/);
    const stackHeight =
      IMAGE_HEIGHT + TITLE_TWO_LINES + 2 * BUTTON_HEIGHT + DISCLOSURE_HEIGHT + VERTICAL_MARGINS;
    expect(HEADER_HEIGHT + stackHeight).toBeLessThanOrEqual(VIEWPORT_HEIGHT);
    // And the disclosure line really does render directly after the buy buttons.
    const teepublicIndex = html.indexOf("Buy on TeePublic");
    const disclosureIndex = html.indexOf("We may earn a commission");
    const moreIndex = html.indexOf("More about this design");
    expect(disclosureIndex).toBeGreaterThan(teepublicIndex);
    expect(moreIndex).toBeGreaterThan(disclosureIndex);
  });

  it("shows TeePublic as the primary button when the design has no Redbubble listing", async () => {
    const design: Design = makeDesign({
      externalLink: "",
      externalId: null,
      props: { teepublicLink: "https://www.teepublic.com/t-shirt/99914330-look-past-the-stars" },
    });
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });

    const html = await renderPage(design.slug as string);
    // The first anchor on the page is the primary buy button.
    const anchorStart = html.indexOf('<a href="');
    const primaryHref = html.slice(anchorStart).match(/^<a href="([^"]+)"/)?.[1];
    expect(primaryHref).toBe(
      "https://www.teepublic.com/t-shirt/99914330-look-past-the-stars?ref_id=ref-123",
    );
    // …and the redbubble button is absent entirely.
    expect(html).not.toContain("Buy on Redbubble");
    expect(html).not.toContain("pxf.example");
  });

  it("keeps GA4 parameters correct when TeePublic is the primary button", async () => {
    const design: Design = makeDesign({
      externalLink: "",
      externalId: null,
      props: { teepublicLink: "https://www.teepublic.com/t-shirt/99914330-look-past-the-stars" },
    });
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });

    const buyLinks = await renderBuyLinks(design.slug as string);
    expect(buyLinks).toHaveLength(1);
    expect(buyLinks[0].props).toMatchObject({
      platform: "teepublic",
      designSlug: design.slug,
      pageType: "landing",
      position: "primary",
    });
  });

  it("404s when the design has no marketplace link at all", async () => {
    const design = makeDesign({ externalLink: "", externalId: null, props: {} });
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });
    await expect(renderPage(design.slug as string)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s for an unknown slug", async () => {
    getDesignBySlug.mockResolvedValue(null);
    await expect(renderPage("no-such-design")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("resolves legacy uuid links through getDesignById", async () => {
    const design = makeDesign({ slug: null });
    getDesignById.mockResolvedValue({ design, relatedDesigns: [] });
    const html = await renderPage(design.id);
    expect(getDesignById).toHaveBeenCalledWith(design.id);
    expect(html).toContain(design.title);
  });
});
