import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { Design } from "@/types/design";

const getDesignBySlug = vi.fn();
const getDesignById = vi.fn();

vi.mock("@/utils/database", () => ({
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
    externalImageUrl: "",
    category: "no_category",
    collection: "Space Shirts",
    imageName: "",
    description: "A bold typographic space graphic featuring an explorer with a telescope.",
    keywords: "astronaut,space",
    backgroundColors: "",
    backgroundColor: "#D2E4FF",
    createdAt: "2026-10-07T08:10:00.000Z",
    updatedAt: "2026-10-08T09:00:00.000Z",
    props: { mockup_tshirt: "https://ih1.redbubble.com/mockup.png" },
    ...overrides,
  };
}

async function tinyImagePng(): Promise<Uint8Array> {
  return sharp({
    create: { width: 120, height: 80, channels: 3, background: { r: 40, g: 80, b: 160 } },
  })
    .png()
    .toBuffer();
}

async function callRoute(slug: string): Promise<Response> {
  const { GET } = await import("@/app/p/[slug]/pin.jpg/route");
  return GET(new Request(`https://threadquirk.test/p/${slug}/pin.jpg`), {
    params: Promise.resolve({ slug }),
  });
}

beforeEach(() => {
  getDesignBySlug.mockReset();
  getDesignById.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/p/[slug]/pin.jpg", () => {
  it("renders a 1000×1500 JPEG from the upstream mockup, with strong cache headers", async () => {
    const design = makeDesign();
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(await tinyImagePng(), { status: 200, headers: { "Content-Type": "image/png" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await callRoute(design.slug as string);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=86400, s-maxage=604800, stale-while-revalidate",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ih1.redbubble.com/mockup.png",
      expect.anything(),
    );

    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(metadata.width).toBe(1000);
    expect(metadata.height).toBe(1500);
    expect(metadata.format).toBe("jpeg");
  });

  it("answers 503 without caching when the upstream fetch fails", async () => {
    const design = makeDesign();
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("CDN unavailable")),
    );

    const response = await callRoute(design.slug as string);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 503 when the upstream responds with an error status", async () => {
    const design = makeDesign();
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));

    const response = await callRoute(design.slug as string);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404s for an unknown slug", async () => {
    getDesignBySlug.mockResolvedValue(null);
    const response = await callRoute("no-such-design");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("404s when the design has no display image", async () => {
    const design = makeDesign({ externalImageUrl: "", props: {} });
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });

    const response = await callRoute(design.slug as string);
    expect(response.status).toBe(404);
  });

  it("404s when the display image is not on an allow-listed host", async () => {
    const design = makeDesign({
      externalImageUrl: "",
      props: { mockup_tshirt: "https://evil.example/mockup.png" },
    });
    getDesignBySlug.mockResolvedValue({ design, relatedDesigns: [] });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await callRoute(design.slug as string);
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
