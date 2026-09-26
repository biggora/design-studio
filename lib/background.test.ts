import { describe, it, expect } from "vitest";
import {
  BACKGROUND_PRESETS,
  applyBackground,
  buildBackgroundImageUrl,
  extractMockupToken,
  isValidBackgroundValue,
  resolveBackgroundToken,
  tokenToHex,
} from "@/lib/background";

const WHITE_TOKEN = "fafafa:ca443f4786";
const BLACK_TOKEN = "101010:01c5ca27c6";
const MOCKUP_URL = `https://ih1.redbubble.net/image.1.4567/ssrco,classic_tee,flatlay,${WHITE_TOKEN},front,tall_portrait,x1000.jpg`;

describe("extractMockupToken", () => {
  it("extracts the token from a classic_tee mockup URL", () => {
    expect(extractMockupToken(MOCKUP_URL)).toBe(WHITE_TOKEN);
  });

  it("returns null for null/undefined/non-matching input", () => {
    expect(extractMockupToken(null)).toBeNull();
    expect(extractMockupToken(undefined)).toBeNull();
    expect(extractMockupToken("https://example.com/not-a-mockup.jpg")).toBeNull();
  });
});

describe("isValidBackgroundValue", () => {
  it("accepts auto, preset names, and raw tokens", () => {
    expect(isValidBackgroundValue("auto")).toBe(true);
    expect(isValidBackgroundValue("white")).toBe(true);
    expect(isValidBackgroundValue("black")).toBe(true);
    expect(isValidBackgroundValue(WHITE_TOKEN)).toBe(true);
  });

  it("normalizes uppercase input before validating", () => {
    expect(isValidBackgroundValue("AUTO")).toBe(true);
    expect(isValidBackgroundValue("WHITE")).toBe(true);
    expect(isValidBackgroundValue(WHITE_TOKEN.toUpperCase())).toBe(true);
  });

  it("rejects garbage / arbitrary hex without a valid hash", () => {
    expect(isValidBackgroundValue("ff0000")).toBe(false);
    expect(isValidBackgroundValue("not-a-color")).toBe(false);
    expect(isValidBackgroundValue("")).toBe(false);
  });

  it("rejects prototype-chain keys, not just BACKGROUND_PRESETS' own keys", () => {
    expect(isValidBackgroundValue("constructor")).toBe(false);
    expect(isValidBackgroundValue("__proto__")).toBe(false);
    expect(isValidBackgroundValue("toString")).toBe(false);
  });
});

describe("resolveBackgroundToken", () => {
  it("auto resolves to the design's mockup token", () => {
    expect(resolveBackgroundToken("auto", { props: { mockup_tshirt: MOCKUP_URL } })).toBe(
      WHITE_TOKEN,
    );
  });

  it("auto returns null when the design has no mockup", () => {
    expect(resolveBackgroundToken("auto", { props: {} })).toBeNull();
    expect(resolveBackgroundToken("auto", { props: undefined })).toBeNull();
  });

  it("resolves preset names to their known tokens", () => {
    expect(resolveBackgroundToken("white", { props: {} })).toBe(BACKGROUND_PRESETS.white);
    expect(resolveBackgroundToken("black", { props: {} })).toBe(BACKGROUND_PRESETS.black);
  });

  it("returns a raw token unchanged (case-insensitive)", () => {
    expect(resolveBackgroundToken(BLACK_TOKEN, { props: {} })).toBe(BLACK_TOKEN);
    expect(resolveBackgroundToken(BLACK_TOKEN.toUpperCase(), { props: {} })).toBe(BLACK_TOKEN);
  });

  it("returns null for an invalid value", () => {
    expect(resolveBackgroundToken("not-a-color", { props: {} })).toBeNull();
  });

  it("returns null for prototype-chain keys ('constructor', '__proto__')", () => {
    expect(resolveBackgroundToken("constructor", { props: {} })).toBeNull();
    expect(resolveBackgroundToken("__proto__", { props: {} })).toBeNull();
  });
});

describe("buildBackgroundImageUrl", () => {
  it("rewrites a Redbubble image URL to the raf,... background variant", () => {
    expect(
      buildBackgroundImageUrl(
        "https://ih1.redbubble.net/image.5909636501.6884/flat,500x,075,f.u2.jpg",
        BLACK_TOKEN,
      ),
    ).toBe("https://ih1.redbubble.net/image.5909636501.6884/raf,750x,075,f,101010:01c5ca27c6.jpg");
  });

  it("passes through a non-Redbubble-shaped URL unchanged", () => {
    const url = "https://example.com/some/other/image.jpg";
    expect(buildBackgroundImageUrl(url, BLACK_TOKEN)).toBe(url);
  });
});

describe("tokenToHex", () => {
  it("returns the hex prefix with a leading #", () => {
    expect(tokenToHex(WHITE_TOKEN)).toBe("#fafafa");
    expect(tokenToHex(BLACK_TOKEN)).toBe("#101010");
  });
});

describe("applyBackground", () => {
  it("resolves auto against the design's mockup and rewrites the image URL", () => {
    const design = {
      externalImageUrl: "https://ih1.redbubble.net/image.5909636501.6884/flat,500x,075,f.u2.jpg",
      props: { mockup_tshirt: MOCKUP_URL },
    };
    expect(applyBackground(design, "auto")).toEqual({
      externalImageUrl:
        "https://ih1.redbubble.net/image.5909636501.6884/raf,750x,075,f,fafafa:ca443f4786.jpg",
      backgroundColor: "#fafafa",
    });
  });

  it("returns null when auto has no mockup token", () => {
    const design = {
      externalImageUrl: "https://ih1.redbubble.net/image.1.2/flat,500x,075,f.u2.jpg",
      props: {},
    };
    expect(applyBackground(design, "auto")).toBeNull();
  });

  it("returns null when the image URL is not a Redbubble image URL", () => {
    const design = {
      externalImageUrl: "https://example.com/not-redbubble.jpg",
      props: {},
    };
    expect(applyBackground(design, "white")).toBeNull();
  });

  it("returns null when externalImageUrl is empty/null/undefined instead of throwing", () => {
    expect(applyBackground({ externalImageUrl: "", props: {} }, "white")).toBeNull();
    expect(
      applyBackground(
        { externalImageUrl: null as unknown as string, props: {} },
        "white",
      ),
    ).toBeNull();
    expect(
      applyBackground(
        { externalImageUrl: undefined as unknown as string, props: {} },
        "white",
      ),
    ).toBeNull();
  });

  it("still resolves (rather than reporting 'not a Redbubble image') when this exact background is already applied", () => {
    const design = {
      externalImageUrl:
        "https://ih1.redbubble.net/image.5909636501.6884/raf,750x,075,f,fafafa:ca443f4786.jpg",
      props: {},
    };
    expect(applyBackground(design, "white")).toEqual({
      externalImageUrl:
        "https://ih1.redbubble.net/image.5909636501.6884/raf,750x,075,f,fafafa:ca443f4786.jpg",
      backgroundColor: "#fafafa",
    });
  });
});
