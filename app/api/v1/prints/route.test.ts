import { describe, it, expect, beforeEach, vi } from "vitest";
import { Design } from "@/types/design";

const fetchDesignsMock = vi.fn();
const fetchRandomDesignsMock = vi.fn();
const getDesignByIdMock = vi.fn();
const fetchCollectionsMock = vi.fn();

vi.mock("@/utils/database", () => ({
  fetchDesigns: fetchDesignsMock,
  fetchRandomDesigns: fetchRandomDesignsMock,
  getDesignById: getDesignByIdMock,
  fetchCollections: fetchCollectionsMock,
}));

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
    keywords: "cat, cute",
    backgroundColors: "#fff",
    backgroundColor: "#ffffff",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-02",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/prints", () => {
  it("passes clamped page/limit/q/collection to fetchDesigns and returns PublicPrint items", async () => {
    fetchDesignsMock.mockResolvedValue({ designs: [makeDesign()], total: 1 });
    const { GET } = await import("@/app/api/v1/prints/route");
    const request = new Request(
      "http://localhost/api/v1/prints?page=2&limit=999&q=cat&collection=cats",
    );
    const response = await GET(request);
    const body = await response.json();

    expect(fetchDesignsMock).toHaveBeenCalledWith(2, "cat", "cats", 50);
    expect(body).toEqual({
      items: [
        expect.objectContaining({ id: "d1", title: "Cat" }),
      ],
      page: 2,
      limit: 50,
      total: 1,
    });
    expect(body.items[0]).not.toHaveProperty("imageName");
  });

  it("returns 500 without leaking error details when fetchDesigns throws", async () => {
    fetchDesignsMock.mockRejectedValue(new Error("db exploded"));
    const { GET } = await import("@/app/api/v1/prints/route");
    const request = new Request("http://localhost/api/v1/prints");
    const response = await GET(request);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});

describe("OPTIONS /api/v1/prints", () => {
  it("returns 204 with ACAO for an allowed origin", async () => {
    vi.stubEnv("PRINTS_API_ALLOWED_ORIGINS", "https://a.example");
    const { OPTIONS } = await import("@/app/api/v1/prints/route");
    const request = new Request("http://localhost/api/v1/prints", {
      headers: { origin: "https://a.example" },
    });
    const response = await OPTIONS(request);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://a.example");
    vi.unstubAllEnvs();
  });
});

describe("GET /api/v1/prints/random", () => {
  it("uses the default limit and undefined collection when absent, with no-store cache", async () => {
    fetchRandomDesignsMock.mockResolvedValue([makeDesign()]);
    const { GET } = await import("@/app/api/v1/prints/random/route");
    const request = new Request("http://localhost/api/v1/prints/random");
    const response = await GET(request);

    expect(fetchRandomDesignsMock).toHaveBeenCalledWith(3, undefined);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      items: [expect.objectContaining({ id: "d1" })],
    });
  });

  it("clamps limit=50 down to the max of 12", async () => {
    fetchRandomDesignsMock.mockResolvedValue([]);
    const { GET } = await import("@/app/api/v1/prints/random/route");
    const request = new Request("http://localhost/api/v1/prints/random?limit=50");
    await GET(request);
    expect(fetchRandomDesignsMock).toHaveBeenCalledWith(12, undefined);
  });

  it("passes the collection filter through when provided", async () => {
    fetchRandomDesignsMock.mockResolvedValue([]);
    const { GET } = await import("@/app/api/v1/prints/random/route");
    const request = new Request("http://localhost/api/v1/prints/random?collection=cats");
    await GET(request);
    expect(fetchRandomDesignsMock).toHaveBeenCalledWith(3, "cats");
  });
});

describe("GET /api/v1/prints/[id]", () => {
  it("returns 200 with the item when found", async () => {
    getDesignByIdMock.mockResolvedValue({ design: makeDesign(), relatedDesigns: [] });
    const { GET } = await import("@/app/api/v1/prints/[id]/route");
    const request = new Request("http://localhost/api/v1/prints/d1");
    const response = await GET(request, { params: Promise.resolve({ id: "d1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: expect.objectContaining({ id: "d1" }) });
  });

  it("returns 404 when getDesignById returns null", async () => {
    getDesignByIdMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/v1/prints/[id]/route");
    const request = new Request("http://localhost/api/v1/prints/missing");
    const response = await GET(request, { params: Promise.resolve({ id: "missing" }) });
    expect(response.status).toBe(404);
  });

  it("returns 400 for an id longer than 100 characters", async () => {
    const { GET } = await import("@/app/api/v1/prints/[id]/route");
    const longId = "a".repeat(101);
    const request = new Request(`http://localhost/api/v1/prints/${longId}`);
    const response = await GET(request, { params: Promise.resolve({ id: longId }) });
    expect(response.status).toBe(400);
    expect(getDesignByIdMock).not.toHaveBeenCalled();
  });

  it("returns 500 without leaking error details when getDesignById throws", async () => {
    getDesignByIdMock.mockRejectedValue(new Error("db exploded"));
    const { GET } = await import("@/app/api/v1/prints/[id]/route");
    const request = new Request("http://localhost/api/v1/prints/d1");
    const response = await GET(request, { params: Promise.resolve({ id: "d1" }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});

describe("GET /api/v1/collections", () => {
  it("returns items from fetchCollections", async () => {
    fetchCollectionsMock.mockResolvedValue(["cats", "dogs"]);
    const { GET } = await import("@/app/api/v1/collections/route");
    const request = new Request("http://localhost/api/v1/collections");
    const response = await GET(request);
    expect(await response.json()).toEqual({ items: ["cats", "dogs"] });
  });

  it("returns 500 without leaking error details when fetchCollections throws", async () => {
    fetchCollectionsMock.mockRejectedValue(new Error("db exploded"));
    const { GET } = await import("@/app/api/v1/collections/route");
    const request = new Request("http://localhost/api/v1/collections");
    const response = await GET(request);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});
