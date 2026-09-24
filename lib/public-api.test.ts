import { describe, it, expect, afterEach, vi } from "vitest";
import {
  toPublicPrint,
  getAllowedOrigins,
  corsHeaders,
  jsonResponse,
  optionsResponse,
  parseIntParam,
} from "@/lib/public-api";
import { Design } from "@/types/design";

function makeDesign(overrides: Partial<Design> = {}): Design {
  return {
    id: "d1",
    externalId: 123,
    title: "Cat",
    externalLink: "https://redbubble.com/i/d1",
    externalImageUrl: "https://redbubble.com/image.jpg",
    category: "t-shirt",
    collection: "cats",
    imageName: "cat.jpg",
    description: "A cat design",
    keywords: "cat, cute, pet",
    backgroundColors: "#fff",
    backgroundColor: "#ffffff",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-02",
    price: 19.99,
    shared: true,
    props: { mockup_tshirt: "https://redbubble.com/mockup.jpg" },
    ...overrides,
  };
}

describe("toPublicPrint", () => {
  it("maps imageUrl, link and mockupUrl from props.mockup_tshirt", () => {
    const result = toPublicPrint(makeDesign());
    expect(result.imageUrl).toBe("https://redbubble.com/image.jpg");
    expect(result.link).toBe("https://redbubble.com/i/d1");
    expect(result.mockupUrl).toBe("https://redbubble.com/mockup.jpg");
  });

  it("returns null mockupUrl when props is missing", () => {
    const result = toPublicPrint(makeDesign({ props: undefined }));
    expect(result.mockupUrl).toBeNull();
  });

  it("splits, trims, and filters empty keywords", () => {
    const result = toPublicPrint(makeDesign({ keywords: " a, ,b " }));
    expect(result.keywords).toEqual(["a", "b"]);
  });

  it("returns an empty keywords array for an empty string", () => {
    const result = toPublicPrint(makeDesign({ keywords: "" }));
    expect(result.keywords).toEqual([]);
  });

  it.each(["no_collection", ""])("maps collection %j to null", collection => {
    const result = toPublicPrint(makeDesign({ collection }));
    expect(result.collection).toBeNull();
  });

  it("returns null backgroundColor for an empty string", () => {
    const result = toPublicPrint(makeDesign({ backgroundColor: "" }));
    expect(result.backgroundColor).toBeNull();
  });

  it("does not leak internal design fields", () => {
    const result = toPublicPrint(makeDesign());
    expect(result).not.toHaveProperty("imageName");
    expect(result).not.toHaveProperty("shared");
    expect(result).not.toHaveProperty("price");
    expect(result).not.toHaveProperty("externalId");
  });
});

describe("corsHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("echoes an allowed origin", () => {
    vi.stubEnv("PRINTS_API_ALLOWED_ORIGINS", "https://a.example, https://b.example/");
    const req = new Request("http://localhost/api/v1/prints", {
      headers: { origin: "https://b.example" },
    });
    expect(corsHeaders(req)["Access-Control-Allow-Origin"]).toBe("https://b.example");
  });

  it("does not set ACAO for an origin not in the allowlist, but sets Vary", () => {
    vi.stubEnv("PRINTS_API_ALLOWED_ORIGINS", "https://a.example");
    const req = new Request("http://localhost/api/v1/prints", {
      headers: { origin: "https://evil.example" },
    });
    const headers = corsHeaders(req);
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(headers.Vary).toBe("Origin");
  });

  it("allows any origin when configured with *", () => {
    vi.stubEnv("PRINTS_API_ALLOWED_ORIGINS", "*");
    const req = new Request("http://localhost/api/v1/prints", {
      headers: { origin: "https://anything.example" },
    });
    expect(corsHeaders(req)["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("defaults to allowing any origin when the env var is unset", () => {
    vi.stubEnv("PRINTS_API_ALLOWED_ORIGINS", "");
    const req = new Request("http://localhost/api/v1/prints", {
      headers: { origin: "https://a.example" },
    });
    expect(corsHeaders(req)["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("tolerates a trailing slash in the allowlist entry", () => {
    vi.stubEnv("PRINTS_API_ALLOWED_ORIGINS", "https://a.example/");
    const req = new Request("http://localhost/api/v1/prints", {
      headers: { origin: "https://a.example" },
    });
    expect(corsHeaders(req)["Access-Control-Allow-Origin"]).toBe("https://a.example");
  });
});

describe("getAllowedOrigins", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("trims, strips trailing slashes and filters empty entries", () => {
    vi.stubEnv("PRINTS_API_ALLOWED_ORIGINS", " https://a.example/, , https://b.example ");
    expect(getAllowedOrigins()).toEqual(["https://a.example", "https://b.example"]);
  });

  it("defaults to * when the env var is unset, empty, or whitespace/commas only", () => {
    vi.stubEnv("PRINTS_API_ALLOWED_ORIGINS", "");
    expect(getAllowedOrigins()).toEqual(["*"]);

    vi.stubEnv("PRINTS_API_ALLOWED_ORIGINS", " , , ");
    expect(getAllowedOrigins()).toEqual(["*"]);
  });
});

describe("jsonResponse", () => {
  it("defaults to a public, cacheable Cache-Control header", () => {
    const req = new Request("http://localhost/api/v1/prints");
    const res = jsonResponse(req, { ok: true });
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
  });

  it("uses no-store when cache option is no-store", () => {
    const req = new Request("http://localhost/api/v1/prints");
    const res = jsonResponse(req, { ok: true }, { cache: "no-store" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("uses no-store for error statuses", () => {
    const req = new Request("http://localhost/api/v1/prints");
    const res = jsonResponse(req, { error: "not found" }, { status: 404 });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.status).toBe(404);
  });
});

describe("optionsResponse", () => {
  it("returns a 204 response", () => {
    const req = new Request("http://localhost/api/v1/prints");
    const res = optionsResponse(req);
    expect(res.status).toBe(204);
  });
});

describe("parseIntParam", () => {
  it("returns the default when value is null", () => {
    expect(parseIntParam(null, 12, 1, 50)).toBe(12);
  });

  it("returns the default for a non-numeric value", () => {
    expect(parseIntParam("abc", 12, 1, 50)).toBe(12);
  });

  it("returns the default for a non-integer value", () => {
    expect(parseIntParam("1.5", 12, 1, 50)).toBe(12);
  });

  it("clamps values below the minimum", () => {
    expect(parseIntParam("0", 12, 1, 50)).toBe(1);
  });

  it("clamps values above the maximum", () => {
    expect(parseIntParam("999", 12, 1, 50)).toBe(50);
  });
});
