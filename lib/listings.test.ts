import { describe, expect, it } from "vitest";
import { ListingsError, parseIngestInput } from "@/lib/listings";

const sha256 = "a".repeat(64);
const body = () => ({
  design: { sourceImageId: 299, sha256, title: "Space cat" },
  listing: { platform: "redbubble", account: "redbubble:main", externalId: "184507566", url: "https://www.redbubble.com/shop/ap/184507566" },
});

function parseField(value: unknown): ListingsError {
  try {
    parseIngestInput({ ...body(), design: { ...body().design, cdnImage: value } });
  } catch (error) {
    if (error instanceof ListingsError) return error;
    throw error;
  }
  throw new Error("Expected parseIngestInput to reject the value");
}

describe("parseIngestInput cdnImage", () => {
  it("accepts a valid cdnImage and stores it on the design", () => {
    const input = parseIngestInput({
      ...body(),
      design: { ...body().design, cdnImage: { key: `designs/${sha256.slice(0, 16)}`, version: 1, width: 1600, height: 1920 } },
    });
    expect(input.design.cdnImage).toEqual({ key: `designs/${sha256.slice(0, 16)}`, version: 1, width: 1600, height: 1920 });
  });

  it("accepts the field absent", () => {
    expect(parseIngestInput(body()).design.cdnImage).toBeUndefined();
  });

  it.each([
    ["a string", "designs/x"],
    ["an array", ["key"]],
    ["null", null],
  ])("rejects a non-object cdnImage (%s)", (_name, value) => {
    const error = parseField(value);
    expect(error.status).toBe(400);
    expect(error.code).toBe("VALIDATION");
    expect(error.field).toBe("design.cdnImage");
  });

  it("rejects an unknown nested key with its field name", () => {
    const error = parseField({ key: `designs/${sha256.slice(0, 16)}`, version: 1, width: 1600, height: 1920, format: "webp" });
    expect(error.status).toBe(400);
    expect(error.field).toBe("design.cdnImage.format");
  });

  it("rejects a key that does not match designs/ + the first 16 hex chars of sha256", () => {
    for (const key of ["designs/0000000000000000", `designs/${sha256.slice(0, 15)}`, `designs/${sha256.slice(0, 16).toUpperCase()}`, "images/f45e5bc7a5342c2c", ""]) {
      const error = parseField({ key, version: 1, width: 1600, height: 1920 });
      expect(error.status).toBe(400);
      expect(error.field).toBe("design.cdnImage.key");
      expect(error.message).toContain(`designs/${sha256.slice(0, 16)}`);
    }
  });

  it.each([0, -1, 1.5, "1", null, undefined])("rejects version %p", value => {
    const error = parseField({ key: `designs/${sha256.slice(0, 16)}`, version: value, width: 1600, height: 1920 });
    expect(error.status).toBe(400);
    expect(error.field).toBe("design.cdnImage.version");
  });

  it.each([0, -1600, 1.5, "1600", undefined])("rejects width %p", value => {
    const error = parseField({ key: `designs/${sha256.slice(0, 16)}`, version: 1, width: value, height: 1920 });
    expect(error.status).toBe(400);
    expect(error.field).toBe("design.cdnImage.width");
  });

  it.each([0, -1920, 1.5, "1920", undefined])("rejects height %p", value => {
    const error = parseField({ key: `designs/${sha256.slice(0, 16)}`, version: 1, width: 1600, height: value });
    expect(error.status).toBe(400);
    expect(error.field).toBe("design.cdnImage.height");
  });

  it("derives the expected key from the lowercased sha256", () => {
    const input = parseIngestInput({
      ...body(),
      design: { ...body().design, sha256: sha256.toUpperCase(), cdnImage: { key: `designs/${sha256.slice(0, 16)}`, version: 2, width: 800, height: 1000 } },
    });
    expect(input.design.cdnImage).toEqual({ key: `designs/${sha256.slice(0, 16)}`, version: 2, width: 800, height: 1000 });
  });
});
