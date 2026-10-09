import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import config from "@/config/config.json";
import type { Design } from "@/types/design";

const design: Design = {
  id: "123e4567-e89b-12d3-a456-426614174000", slug: "space-cat", externalId: null,
  title: "My Other Machine Is Production Pixel Art", description: "Cat in space. ".repeat(20),
  keywords: "cat", category: "", collection: "Space", imageName: "",
  externalLink: "", externalImageUrl: "https://ih1.redbubble.net/image.1/flat.jpg",
  backgroundColor: "#000000", backgroundColors: "", createdAt: "", updatedAt: "",
  props: { mockup_tshirt: "https://ih1.redbubble.net/image.2/mockup.jpg" },
};

vi.mock("@/utils/database", () => ({
  getSiteConfig: async () => config,
  getDesignBySlug: async (slug: string) => (slug === "space-cat" ? { design, relatedDesigns: [] } : null),
  getDesignById: async () => null,
}));

import DesignImage from "@/app/designs/[slug]/opengraph-image";
import TwitterImage from "@/app/designs/[slug]/twitter-image";
import BrandImage from "@/app/opengraph-image";

const realFetch = globalThis.fetch;
afterEach(() => vi.unstubAllGlobals());

// ImageResponse loads its wasm through global fetch, so only intercept the mockup host.
function stubMockupFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes("redbubble.net") ? impl() : realFetch(input, init),
  );
}

async function expectCard(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  const png = Buffer.from(await response.arrayBuffer());
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(1200); // IHDR width
  expect(png.readUInt32BE(20)).toBe(630); // IHDR height
}

describe("OpenGraph image routes", () => {
  it("renders 1200x630 for a known slug with its mockup", async () => {
    const jpeg = await sharp({ create: { width: 30, height: 40, channels: 3, background: "#888" } }).jpeg().toBuffer();
    stubMockupFetch(async () => new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg" } }));
    await expectCard(await DesignImage({ params: Promise.resolve({ slug: "space-cat" }) }));
  });

  it("still renders when the mockup fetch fails", async () => {
    stubMockupFetch(async () => { throw new Error("blocked"); });
    await expectCard(await DesignImage({ params: Promise.resolve({ slug: "space-cat" }) }));
  });

  it("falls back to the brand card for an unknown slug", async () => {
    await expectCard(await DesignImage({ params: Promise.resolve({ slug: "nope" }) }));
  });

  it("renders the site brand card", async () => {
    await expectCard(await BrandImage());
  });

  it("twitter image reuses the same renderer", () => {
    expect(TwitterImage).toBe(DesignImage);
  });
});
