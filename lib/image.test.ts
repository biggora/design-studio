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
  normalizeCdnImageMockups,
  watermarkText,
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

describe("watermarkText", () => {
  it("returns the trimmed env value", () => {
    vi.stubEnv("NEXT_PUBLIC_WATERMARK", "  threadquirk.lv  ");
    expect(watermarkText()).toBe("threadquirk.lv");
  });

  it("treats unset and empty as disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_WATERMARK", "");
    expect(watermarkText()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_WATERMARK", "   ");
    expect(watermarkText()).toBeNull();
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

const mockups = [
  { key: "designs/f45e5bc7a5342c2c/mockups/66c018b96d9c6dac", kind: "flat-full", version: 1, width: 1024, height: 1536 },
  { key: "designs/f45e5bc7a5342c2c/mockups/002a102ae0ec24d0", kind: "hanger-close", version: 1, width: 1024, height: 1536 },
];

describe("a stored cdnImage mockup array on the storefront", () => {
  const entry = (hex: string, kind: string, width: number, height: number) => ({
    key: `designs/f45e5bc7a5342c2c/mockups/${hex.repeat(16)}`, kind, version: 1, width, height,
  });
  const pick = (m: { key: string; version: number; width: number; height: number }) => ({
    key: m.key, version: m.version, width: m.width, height: m.height,
  });
  // The ingest order; the flat shots are landscape, the hanger shots portrait.
  const flatFull = entry("1", "flat-full", 1536, 1024);
  const hangerFull = entry("2", "hanger-full", 1024, 1536);
  const flatClose = entry("3", "flat-close", 1536, 1024);
  const hangerClose = entry("4", "hanger-close", 1024, 1536);
  const fourMockups = [flatFull, hangerFull, flatClose, hangerClose];

  it("prefers the first portrait mockup in array order over a landscape flat-full", () => {
    expect(normalizeCdnImage(fourMockups)).toEqual(pick(hangerFull));
    expect(normalizeCdnImage([flatFull, flatClose, hangerClose, hangerFull])).toEqual(pick(hangerClose));
  });

  it("picks flat-full when every mockup is landscape", () => {
    expect(normalizeCdnImage([flatClose, flatFull, entry("5", "hanger-full", 1536, 1024)])).toEqual(pick(flatFull));
  });

  it("picks the first entry when all are portrait", () => {
    const allPortrait = [entry("6", "flat-close", 1024, 1536), entry("7", "flat-full", 1024, 1536), hangerFull];
    expect(normalizeCdnImage(allPortrait)).toEqual(pick(allPortrait[0]));
  });

  it("picks the first valid entry when none is portrait and there is no flat-full", () => {
    expect(normalizeCdnImage([{ ...flatFull, kind: "side" }, flatClose, entry("8", "hanger-close", 1536, 1024)])).toEqual(pick(flatClose));
  });

  it("ignores invalid entries when looking for the portrait one", () => {
    expect(normalizeCdnImage([flatFull, { ...hangerFull, version: 0 }, { ...hangerFull, kind: "side" }, hangerClose])).toEqual(pick(hangerClose));
  });

  it("parses a mysql2 JSON-string array", () => {
    expect(normalizeCdnImage(JSON.stringify(fourMockups))).toEqual(pick(hangerFull));
  });

  it("still accepts the legacy single object", () => {
    expect(normalizeCdnImage(cdnImage)).toEqual(cdnImage);
    expect(normalizeCdnImage(JSON.stringify(cdnImage))).toEqual(cdnImage);
  });

  it("returns null for junk arrays", () => {
    for (const value of [[], "[]", [null, "x", []], [{ ...mockups[0], version: 0 }], [{ key: "", kind: "flat-full", version: 1, width: 1, height: 1 }], "[not json", 7, true]) {
      expect(normalizeCdnImage(value)).toBeNull();
    }
  });

  it("serves the CDN card, srcSet and the portrait mockup size for getDesignImage", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", CDN);
    const design = makeDesign({ cdnImage: normalizeCdnImage(fourMockups) });
    const base = `${CDN}/${hangerFull.key}`;
    expect(getDesignImage(design)).toEqual({
      kind: "cdn",
      src: `${base}/card-v1.webp`,
      srcSet: `${base}/thumb-v1.webp 400w, ${base}/card-v1.webp 800w, ${base}/main-v1.webp 1600w`,
      width: 1024,
      height: 1536,
      backgroundColor: "#ffffff",
    });
  });

  it("uses the share JPEG for share URL and pins", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", CDN);
    const design = makeDesign({ cdnImage: normalizeCdnImage(fourMockups), externalImageUrl: "" });
    expect(cdnShareImageUrl(design)).toBe(`${CDN}/${hangerFull.key}/share-v1.jpg`);
    expect(getShareImageUrl(design)).toBe(`${CDN}/${hangerFull.key}/share-v1.jpg`);
    expect(hasPinImage(design)).toBe(true);
  });

  it("keeps the Redbubble fallback without the CDN env", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    const design = makeDesign({ cdnImage: normalizeCdnImage(fourMockups) });
    expect(getDesignImage(design)).toEqual({ kind: "remote", src: "https://ih1.redbubble.net/images/flat.png" });
    expect(cdnShareImageUrl(design)).toBeNull();
    expect(getShareImageUrl(design)).toBe("https://ih1.redbubble.net/images/flat.png");
    expect(hasPinImage(design)).toBe(false);
  });
});

describe("normalizeCdnImageMockups (ingest responses)", () => {
  it("parses a mysql2 JSON string and passes Supabase arrays through", () => {
    expect(normalizeCdnImageMockups(JSON.stringify(mockups))).toEqual(mockups);
    expect(normalizeCdnImageMockups(mockups)).toEqual(mockups);
  });

  it("returns null for absent, malformed, non-array, and empty values (including the old object form)", () => {
    for (const value of [undefined, null, "", "not json", {}, mockups[0], cdnImage, "{}", [], "[]"]) {
      expect(normalizeCdnImageMockups(value)).toBeNull();
    }
  });

  it("drops invalid entries and keeps the valid ones", () => {
    const result = normalizeCdnImageMockups([
      mockups[0], { ...mockups[1], kind: "side" }, { ...mockups[1], version: 0 }, { ...mockups[1], width: "1024" },
      { ...mockups[1], key: "" }, null, "x", [],
    ]);
    expect(result).toEqual([mockups[0]]);
    expect(normalizeCdnImageMockups([{ ...mockups[0], kind: "side" }])).toBeNull();
  });

  it("strips unknown properties", () => {
    expect(normalizeCdnImageMockups([{ ...mockups[0], extra: 1 }])).toEqual([mockups[0]]);
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
