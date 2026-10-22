import { describe, expect, it } from "vitest";
import { ListingsError, parseIngestInput } from "@/lib/listings";

const sha256 = "a".repeat(64);
const body = () => ({
  design: { sourceImageId: 299, sha256, title: "Space cat" },
  listing: { platform: "redbubble", account: "redbubble:main", externalId: "184507566", url: "https://www.redbubble.com/shop/ap/184507566" },
});

const prefix = `designs/${sha256.slice(0, 16)}/mockups/`;
const mockup = (n: number, kind = "flat-full") => ({ key: `${prefix}${n.toString(16).padStart(16, "0")}`, kind, version: 1, width: 1024, height: 1536 });
const kinds = ["flat-full", "hanger-full", "flat-close", "hanger-close"];

function parseField(value: unknown): ListingsError {
  try {
    parseIngestInput({ ...body(), design: { ...body().design, cdnImage: value } });
  } catch (error) {
    if (error instanceof ListingsError) return error;
    throw error;
  }
  throw new Error("Expected parseIngestInput to reject the value");
}
const parseOk = (value: unknown) => parseIngestInput({ ...body(), design: { ...body().design, cdnImage: value } });

describe("parseIngestInput cdnImage (mockup array)", () => {
  it("accepts all four kinds and keeps them in request order", () => {
    const mockups = kinds.map((kind, i) => mockup(i + 1, kind));
    expect(parseOk(mockups).design.cdnImage).toEqual(mockups);
  });

  it("accepts the field absent", () => {
    expect(parseIngestInput(body()).design.cdnImage).toBeUndefined();
  });

  it("derives the expected prefix from the lowercased sha256", () => {
    const input = parseIngestInput({ ...body(), design: { ...body().design, sha256: sha256.toUpperCase(), cdnImage: [mockup(1)] } });
    expect(input.design.cdnImage).toEqual([mockup(1)]);
  });

  it("no longer accepts the old single-object form", () => {
    const error = parseField({ key: `designs/${sha256.slice(0, 16)}`, version: 1, width: 1600, height: 1920 });
    expect(error.status).toBe(400);
    expect(error.code).toBe("VALIDATION");
    expect(error.field).toBe("design.cdnImage");
  });

  it.each([["a string", "designs/x"], ["null", null], ["a number", 5], ["an empty array", []]])("rejects %s", (_name, value) => {
    const error = parseField(value);
    expect(error.status).toBe(400);
    expect(error.field).toBe("design.cdnImage");
  });

  it("rejects a non-object item at its index", () => {
    expect(parseField(["x"]).field).toBe("design.cdnImage[0]");
    expect(parseField([mockup(1), [mockup(2)]]).field).toBe("design.cdnImage[1]");
  });

  it.each([
    ["the old artwork key", `designs/${sha256.slice(0, 16)}`],
    ["another design's sha256", `designs/${"b".repeat(16)}/mockups/${"1".repeat(16)}`],
    ["a wrong segment", `${prefix.replace("/mockups/", "/mocks/")}${"1".repeat(16)}`],
    ["a short hash", `${prefix}${"1".repeat(15)}`],
    ["a long hash", `${prefix}${"1".repeat(17)}`],
    ["an uppercase hash", `${prefix}${"A".repeat(16)}`],
    ["a trailing path", `${prefix}${"1".repeat(16)}/x`],
    ["empty", ""],
  ])("rejects a key with %s", (_name, key) => {
    const error = parseField([{ ...mockup(1), key }]);
    expect(error.status).toBe(400);
    expect(error.code).toBe("VALIDATION");
    expect(error.field).toBe("design.cdnImage[0].key");
  });

  it("rejects a non-string key", () => {
    expect(parseField([{ ...mockup(1), key: 5 }]).field).toBe("design.cdnImage[0].key");
  });

  it("names the index of the offending item", () => {
    expect(parseField([mockup(1), { ...mockup(2), key: "designs/x" }]).field).toBe("design.cdnImage[1].key");
  });

  it.each(["", "side", "FLAT-FULL", null, undefined, 1])("rejects kind %p", kind => {
    expect(parseField([{ ...mockup(1), kind }]).field).toBe("design.cdnImage[0].kind");
  });

  it.each(["version", "width", "height"])("rejects a non-positive-integer %s", field => {
    for (const value of [0, -1, 1.5, "1", null, undefined]) {
      expect(parseField([{ ...mockup(1), [field]: value }]).field).toBe(`design.cdnImage[0].${field}`);
    }
  });

  it("rejects a duplicate key on the repeating item", () => {
    const error = parseField([mockup(1), mockup(2, "hanger-full"), mockup(1, "flat-close")]);
    expect(error.status).toBe(400);
    expect(error.field).toBe("design.cdnImage[2].key");
    expect(error.message).toMatch(/duplicate/i);
  });

  it("rejects an unknown nested key with its field name", () => {
    expect(parseField([{ ...mockup(1), format: "webp" }]).field).toBe("design.cdnImage[0].format");
  });

  it("enforces 1 to 8 items", () => {
    expect(parseField(Array.from({ length: 9 }, (_, i) => mockup(i + 1))).field).toBe("design.cdnImage");
    expect(parseOk(Array.from({ length: 8 }, (_, i) => mockup(i + 1))).design.cdnImage).toHaveLength(8);
  });
});

describe("parseIngestInput extra mockups", () => {
  const redbubble = (extra: unknown) => parseIngestInput({ ...body(), listing: { ...body().listing, extra } });
  const mockups = {
    mockupTshirt: "https://ih1.redbubble.net/image.1.7566/ssrco,classic_tee,flatlay,fafafa:ca443f4786,front,tall_portrait,x1000.jpg",
    mockupHat: "https://ih1.redbubble.net/image.2.7566/ssrco,dad_hat,product,101010:01c5ca27c6,front_three_quarter,wide_portrait,750x1000-bg,f8f8f8.webp",
    mockupMug: "https://ih1.redbubble.net/image.3.7566/ur,classic_mug_left,wide_portrait,750x1000.webp",
    mockupMousepad: "https://ih1.redbubble.net/image.4.7566/ur,mouse_pad_small_flatlay_prop,wide_portrait,750x1000.webp",
  };

  it("accepts all four mockups, and requests without them parse as before", () => {
    expect(redbubble(mockups).listing.extra).toEqual(mockups);
    expect(redbubble({ mockupHat: mockups.mockupHat }).listing.extra).toEqual({ mockupHat: mockups.mockupHat });
    expect(parseIngestInput(body()).listing.extra).toBeUndefined();
  });

  it.each(["mockupTshirt", "mockupHat", "mockupMug", "mockupMousepad"])("rejects a %s on a foreign host", key => {
    expect(() => redbubble({ [key]: "https://evil.example/x.webp" })).toThrow(ListingsError);
    expect(() => redbubble({ [key]: "http://ih1.redbubble.net/x.webp" })).toThrow(ListingsError);
    expect(() => redbubble({ [key]: "https://ih1.redbubble.net.evil.example/x.webp" })).toThrow(ListingsError);
    expect(() => redbubble({ [key]: 5 })).toThrow(ListingsError);
  });

  it("names the offending mockup field", () => {
    try {
      redbubble({ mockupMug: "https://evil.example/x.webp" });
    } catch (error) {
      expect(error).toMatchObject({ field: "listing.extra.mockupMug" });
      return;
    }
    throw new Error("expected a rejection");
  });

  it("still rejects unknown top-level listing fields", () => {
    expect(() => parseIngestInput({ ...body(), listing: { ...body().listing, mockupHat: mockups.mockupHat } })).toThrow(ListingsError);
  });
});
