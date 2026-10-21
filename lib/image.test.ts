import { afterEach, describe, expect, it, vi } from "vitest";
import { Design } from "@/types/design";
import {
  cdnShareImageUrl,
  getDesignImage,
  getDesignDisplayImage,
  getShareImageUrl,
  hasPinImage,
  imagesCdnBase,
  normalizeCdnImage,
} from "@/lib/image";

const CDN = "https://images.threadquirk.lv";

function makeDesign(overrides: Partial<Design> = {}): Design {
  return {
    id: "d1",
    externalId: null,
    title: "Space cat",
    slug: "space-cat",
    externalLink: "",
    externalImageUrl: "https://ih1.redbubble.net/images/flat.png",
    category: "",
    collection: "",
    imageName: "",
    description: "",
    keywords: "",
    backgroundColors: "",
    backgroundColor: "#ffffff",
    createdAt: "",
    updatedAt: "",
    props: {},
    ...overrides,
  };
}

const cdnImage = { key: "designs/f45e5bc7a5342c2c", version: 2, width: 1600, height: 1920 };

afterEach(() => vi.unstubAllEnvs());

describe("imagesCdnBase", () => {
  it("returns the trimmed base without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", `${CDN}///`);
    expect(imagesCdnBase()).toBe(CDN);
  });

  it("rejects empty, http, and garbage values", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    expect(imagesCdnBase()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "   ");
    expect(imagesCdnBase()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "http://images.threadquirk.lv");
    expect(imagesCdnBase()).toBeNull();
  });
});

describe("normalizeCdnImage", () => {
  it("parses a mysql2 JSON string and passes Supabase objects through", () => {
    expect(normalizeCdnImage(JSON.stringify(cdnImage))).toEqual(cdnImage);
    expect(normalizeCdnImage(cdnImage)).toEqual(cdnImage);
  });

  it("returns null for absent, malformed, and invalid values", () => {
    expect(normalizeCdnImage(undefined)).toBeNull();
    expect(normalizeCdnImage(null)).toBeNull();
    expect(normalizeCdnImage("")).toBeNull();
    expect(normalizeCdnImage("not json")).toBeNull();
    expect(normalizeCdnImage({ ...cdnImage, version: 0 })).toBeNull();
    expect(normalizeCdnImage({ ...cdnImage, width: "1600" })).toBeNull();
    expect(normalizeCdnImage({ key: "", version: 1, width: 1, height: 1 })).toBeNull();
  });
});

describe("getDesignImage", () => {
  it("prefers the CDN flat artwork with the three-variant srcSet", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", CDN);
    const source = getDesignImage(makeDesign({ cdnImage }));
    expect(source).toEqual({
      kind: "cdn",
      src: `${CDN}/designs/f45e5bc7a5342c2c/card-v2.webp`,
      srcSet: `${CDN}/designs/f45e5bc7a5342c2c/thumb-v2.webp 400w, ${CDN}/designs/f45e5bc7a5342c2c/card-v2.webp 800w, ${CDN}/designs/f45e5bc7a5342c2c/main-v2.webp 1600w`,
      width: 1600,
      height: 1920,
      backgroundColor: "#ffffff",
    });
  });

  it("keeps the Redbubble fallback chain (mockup, then flat artwork, then placeholder) without the env", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    const withMockup = makeDesign({ props: { mockup_tshirt: "https://ih1.redbubble.net/mockup.png" }, cdnImage });
    expect(getDesignImage(withMockup)).toEqual({ kind: "remote", src: "https://ih1.redbubble.net/mockup.png" });
    expect(getDesignImage(makeDesign({ cdnImage }))).toEqual({ kind: "remote", src: "https://ih1.redbubble.net/images/flat.png" });
    expect(getDesignImage(makeDesign({ cdnImage, externalImageUrl: "  " }))).toEqual({
      kind: "remote",
      src: "/images/no_image_available.svg",
    });
  });

  it("treats an unset env like the empty one (Redbubble fallback even with cdnImage)", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    expect(getDesignImage(makeDesign({ cdnImage })).kind).toBe("remote");
  });

  it("falls back to Redbubble images for a design without cdnImage even with the env set", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", CDN);
    expect(getDesignImage(makeDesign()).kind).toBe("remote");
  });
});

describe("cdnShareImageUrl / getShareImageUrl", () => {
  it("returns the share JPEG for a CDN design", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", CDN);
    expect(cdnShareImageUrl(makeDesign({ cdnImage }))).toBe(`${CDN}/designs/f45e5bc7a5342c2c/share-v2.jpg`);
  });

  it("returns null without a CDN design or env", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", CDN);
    expect(cdnShareImageUrl(makeDesign())).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    expect(cdnShareImageUrl(makeDesign({ cdnImage }))).toBeNull();
  });

  it("getShareImageUrl falls back to the display image, keeping the mockup preference", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", CDN);
    const design = makeDesign({ props: { mockup_tshirt: "https://ih1.redbubble.net/mockup.png" } });
    expect(getShareImageUrl(design)).toBe("https://ih1.redbubble.net/mockup.png");
    expect(getShareImageUrl(makeDesign())).toBe("https://ih1.redbubble.net/images/flat.png");
    expect(getShareImageUrl(makeDesign({ cdnImage }))).toBe(`${CDN}/designs/f45e5bc7a5342c2c/share-v2.jpg`);
  });

  it("getShareImageUrl keeps getDesignDisplayImage's contract for empty artwork", () => {
    expect(getShareImageUrl(makeDesign({ externalImageUrl: "" }))).toBe("");
    expect(getDesignDisplayImage(makeDesign({ externalImageUrl: "" }))).toBe("");
  });
});

describe("hasPinImage", () => {
  it("is true for a mockup, a CDN image (with the env), or both", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", CDN);
    expect(hasPinImage(makeDesign({ props: { mockup_tshirt: "https://ih1.redbubble.net/mockup.png" } }))).toBe(true);
    expect(hasPinImage(makeDesign({ cdnImage }))).toBe(true);
    expect(hasPinImage(makeDesign())).toBe(false);
  });

  it("needs the env for a cdnImage-only design", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    expect(hasPinImage(makeDesign({ cdnImage }))).toBe(false);
  });

  it("ignores a junk mockup value", () => {
    expect(hasPinImage(makeDesign({ props: { mockup_tshirt: "  " } }))).toBe(false);
  });
});
