import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createAssignment } from "@pod/pinterest-renderer";
const { read, write } = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("@/utils/database", () => ({
  getPinterestContexts: read,
  setPinterestImage: write,
  getSiteConfig: async () => ({ domain: "example.org" }),
}));
import { GET, PUT } from "./route";
const id = "a0000000-0000-4000-8000-000000000001";
const req = (method: string, body?: unknown, token = "secret") =>
  new Request("https://example.org/api/v1/designs/pinterest-image", {
    method,
    headers: { Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  vi.stubEnv("LISTINGS_API_TOKEN", "secret");
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());
describe("Pinterest preparation API", () => {
  it("requires authorization for reads and writes", async () => {
    expect((await GET(req("GET", undefined, "bad"))).status).toBe(401);
    expect((await PUT(req("PUT", {}, "bad"))).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it("returns an uncached preparation page and validates pagination", async () => {
    read.mockResolvedValue({ items: [], total: 0 });
    const r = await GET(req("GET"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(read).toHaveBeenCalledWith(null, 1, 50, "example.org");
    expect(
      (
        await GET(
          new Request(
            "https://example.org/api/v1/designs/pinterest-image?limit=101",
            { headers: { Authorization: "Bearer secret" } },
          ),
        )
      ).status,
    ).toBe(400);
  });
  it("returns saved data on conflicting assignments", async () => {
    const assignment = await createAssignment({
      designId: id,
      title: "Complete title",
      brand: "example.org",
      sources: [
        {
          role: "tee",
          url: "https://ih1.redbubble.net/image.1.1234/tee.jpg",
          sha256: "a".repeat(64),
          crop: { left: 0, top: 0, width: 500, height: 700 },
        },
      ],
    });
    write.mockResolvedValue({
      status: "conflict",
      pinterestImage: { assignment, asset: null },
    });
    const r = await PUT(
      req("PUT", { designId: id, operation: "assign", assignment }),
    );
    expect(r.status).toBe(409);
    expect((await r.json()).pinterestImage.assignment.hash).toBe(
      assignment.hash,
    );
  });
  it("rejects malformed bodies before data access", async () => {
    expect(
      (
        await PUT(
          req("PUT", { designId: id, operation: "assign", assignment: {} }),
        )
      ).status,
    ).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });
});
