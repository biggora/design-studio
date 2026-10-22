import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { createAssignment, describeSource } from "@pod/pinterest-renderer";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/utils/database", () => ({
  getDesignById: load,
  getDesignBySlug: load,
}));
import { GET } from "./route";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const get = () =>
  GET(new Request("https://example.org/p/actual-print/pin.jpg"), {
    params: Promise.resolve({ slug: "actual-print" }),
  });
describe("assigned pin route", () => {
  it("returns the saved composition with short caching before the cloud file is registered", async () => {
    const source = await sharp({
      create: { width: 500, height: 700, channels: 3, background: "#555555" },
    })
      .png()
      .toBuffer();
    const assignment = await createAssignment({
      designId: "a0000000-0000-4000-8000-000000000001",
      title: "Original full title",
      brand: "example.org",
      sources: [
        await describeSource(
          "tee",
          "https://ih1.redbubble.net/image.1.1234/tee.png",
          source,
        ),
      ],
    });
    load.mockResolvedValue({
      design: {
        id: assignment.designId,
        title: "Renamed later",
        pinterestImage: { assignment, asset: null },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array(source))),
    );
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(
      (await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width,
    ).toBe(1000);
  });
  it("returns 503/no-store when both the saved cloud file and product sources are unavailable", async () => {
    const source = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#555555" },
    })
      .png()
      .toBuffer();
    const assignment = await createAssignment({
      designId: "a0000000-0000-4000-8000-000000000001",
      title: "Original full title",
      brand: "example.org",
      sources: [
        await describeSource(
          "tee",
          "https://ih1.redbubble.net/image.1.1234/tee.png",
          source,
        ),
      ],
    });
    load.mockResolvedValue({
      design: {
        id: assignment.designId,
        pinterestImage: { assignment, asset: null },
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    const response = await get();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("does not fetch files for hidden or missing designs", async () => {
    load.mockResolvedValue(null);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await get()).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
