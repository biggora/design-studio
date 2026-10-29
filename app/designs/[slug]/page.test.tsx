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
const fetchRandomDesigns = vi.fn();
const fetchDesignListingUrl = vi.fn();
vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => config,
  getDesignBySlug: async () => ({ design, relatedDesigns: [] }),
  getDesignById: async () => ({ design, relatedDesigns: [] }),
  fetchRandomDesigns: (...args: unknown[]) => fetchRandomDesigns(...args),
  fetchDesignListingUrl: (...args: unknown[]) => fetchDesignListingUrl(...args),
}));
fetchRandomDesigns.mockResolvedValue([]);
fetchDesignListingUrl.mockResolvedValue(null);
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));
vi.mock("@/app/components/FeaturedDesigns", () => ({ default: () => null }));
vi.mock("@/app/components/BackToCatalog", () => ({ default: () => null }));
vi.mock("@/app/components/ShareLinks", () => ({ default: () => null }));
import DesignDetails, { generateMetadata } from "@/app/designs/[slug]/page";
import { createAssignment } from "@pod/og-renderer";

it("versions both social images by the permanent assignment rather than updatedAt", async () => {
  const before = {ogImage:design.ogImage,updatedAt:design.updatedAt};
  try {
    const assignment=await createAssignment({designId:design.id,title:design.title,brand:config.domain,category:"Original design",sources:[{
      role:"tee",url:"https://ih1.redbubble.net/tee.jpg",sha256:"a".repeat(64),crop:{left:0,top:0,width:750,height:1000},
    }]});
    design.ogImage={assignment,asset:null};
    const first=await generateMetadata({params:Promise.resolve({slug:"space-cat"})});
    design.updatedAt="2030-01-01T00:00:00Z";
    const next=await generateMetadata({params:Promise.resolve({slug:"space-cat"})});
    expect(first.openGraph?.images).toEqual(next.openGraph?.images);
    expect(first.twitter?.images).toEqual(next.twitter?.images);
    expect(JSON.stringify(first.openGraph?.images)).toContain(assignment.hash);
    expect(JSON.stringify(first.openGraph?.images)).toContain("image/jpeg");
  } finally {Object.assign(design,before);}
});

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
  it("keeps artwork details and breadcrumbs connected to the page and company", async () => {
    const html = renderToStaticMarkup(await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) }));
    const data = JSON.parse(html.split('<script type="application/ld+json">')[1].split("</script>")[0]);
    const work = data.find((item: Record<string, unknown>) => item["@type"] === "CreativeWork");
    const page = data.find((item: Record<string, unknown>) => item["@type"] === "WebPage");
    const crumbs = data.find((item: Record<string, unknown>) => item["@type"] === "BreadcrumbList");
    const url = `https://${config.domain}/designs/space-cat`;
    expect(work).toMatchObject({
      "@id": `${url}#artwork`, additionalType: "https://schema.org/VisualArtwork",
      name: design.title, description: design.description, keywords: design.keywords,
      dateCreated: design.createdAt, url, image: `https://${config.domain}/images/no_image_available.svg`,
      creator: { "@type": "Organization", "@id": `https://${config.domain}/#organization`, name: config.name },
      mainEntityOfPage: { "@id": `${url}#webpage` },
    });
    expect(page.mainEntity["@id"]).toBe(work["@id"]);
    expect(page.breadcrumb["@id"]).toBe(crumbs["@id"]);
    expect(work).not.toHaveProperty("offers");
    expect(work).not.toHaveProperty("aggregateRating");
  });
  it("renders the placeholder and TeePublic link without a bogus Redbubble button", async () => {
    const page = await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Space cat");
    expect(html).toContain("/images/no_image_available.svg");
    expect(html).toContain("Buy on TeePublic");
    expect(html).not.toContain("Buy on Redbubble");
    expect(html).not.toContain("shop/ap/null");
    expect(html).toContain("/disclosure");
    expect(html).not.toContain("on a Hat");
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
  it("uses the collection in breadcrumbs and alt text, and links only subject-matched gift pages", async () => {
    const original = { collection: design.collection, props: design.props };
    design.collection = "Cat lovers";
    design.props = { curatedCollections: ["Programming"] };
    Object.assign(config, {
      giftPages: [
        { slug: "pets", topic: "pet-lovers", title: "Pet Gifts", description: "D", intro: "I", sections: [{ collection: "Pets", heading: "H" }] },
        { slug: "other", topic: "developers", title: "Other", description: "D", intro: "I", sections: [{ collection: "Programming", heading: "H" }] },
      ],
    });
    try {
      const html = renderToStaticMarkup(await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) }));
      expect(html).toContain('alt="Space cat – Cat lovers design"');
      expect(html).toContain('href="/gifts/pets"');
      expect(html).toContain("Gift ideas:");
      expect(html).not.toContain("/gifts/other");
      const ld = JSON.parse(html.split('<script type="application/ld+json">')[1].split("</script>")[0]);
      expect(ld[0].itemListElement[1]).toMatchObject({
        name: "Cat lovers",
        item: `https://${config.domain}/designs?collection=Cat+lovers`,
      });
    } finally {
      Object.assign(design, original);
      delete (config as { giftPages?: unknown }).giftPages;
    }
  });
  it("falls back to Designs breadcrumb, plain alt text and no gift line without a collection", async () => {
    const html = renderToStaticMarkup(await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) }));
    expect(html).toContain('alt="Space cat design"');
    expect(html).not.toContain("Gift ideas:");
    expect(html).toContain('"name":"Designs"');
  });
  it("renders only the product mockups captured in props, with alts and captions", async () => {
    const original = design.props;
    design.props = {
      ...original,
      mockup_hat: "https://ih1.redbubble.net/images/cap/hat.jpg",
      mockup_mug: "https://ih1.redbubble.net/images/cap/mug.jpg",
    };
    try {
      const html = renderToStaticMarkup(await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) }));
      expect(html).toContain('alt="Space cat on a Hat"');
      expect(html).toContain("https://ih1.redbubble.net/images/cap/hat.jpg");
      expect(html).toContain('alt="Space cat on a Mug"');
      expect(html).toContain("https://ih1.redbubble.net/images/cap/mug.jpg");
      // The mouse pad has no captured mockup — no tile, no caption, no hole.
      expect(html).not.toContain("Mouse pad");
    } finally {
      design.props = original;
    }
  });
  it("renders Buy on Tostadora from the stored listing only when there is one", async () => {
    fetchDesignListingUrl.mockResolvedValue("https://www.tostadora.co.uk/web/choose-joy/4929330");
    const page = await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Buy on Tostadora");
    expect(html).toContain("https://www.tostadora.co.uk/web/choose-joy/4929330");
    const tostadora = findBuyLinks(page).find(link => link.props.platform === "tostadora");
    expect(tostadora?.props).toMatchObject({ position: "secondary", pageType: "design" });
    expect(fetchDesignListingUrl).toHaveBeenCalledWith(design.id, "tostadora");

    fetchDesignListingUrl.mockResolvedValue(null);
    expect(renderToStaticMarkup(await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) })))
      .not.toContain("Buy on Tostadora");
  });
  it("renders Buy on Zazzle from the stored listing only when there is one", async () => {
    fetchDesignListingUrl.mockImplementation((_id: unknown, platform: unknown) =>
      platform === "zazzle" ? Promise.resolve("https://www.zazzle.com/space-cat-t-shirt-256325396025543708") : Promise.resolve(null));
    const page = await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Buy on Zazzle");
    expect(html).toContain("https://www.zazzle.com/space-cat-t-shirt-256325396025543708");
    const zazzle = findBuyLinks(page).find(link => link.props.platform === "zazzle");
    expect(zazzle?.props).toMatchObject({ position: "secondary", pageType: "design" });
    expect(fetchDesignListingUrl).toHaveBeenCalledWith(design.id, "zazzle");

    fetchDesignListingUrl.mockResolvedValue(null);
    expect(renderToStaticMarkup(await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) })))
      .not.toContain("Buy on Zazzle");
  });
  it("fills the related row from random picks when the design has no related designs", async () => {
    fetchRandomDesigns.mockClear();
    fetchRandomDesigns.mockResolvedValue([{ ...design, id: "999", title: "Other print" }]);
    await DesignDetails({ params: Promise.resolve({ slug: "space-cat" }) });
    expect(fetchRandomDesigns).toHaveBeenCalledWith(6);
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
