import { afterEach, describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import {
  createAssignment,
  describeSource,
  renderPin,
  digest,
  assetKey,
} from "@pod/pinterest-renderer";
import {
  assignedPinResponse,
  readImageResponse,
} from "./pinterest-image-response";
async function setup() {
  const source = await sharp({
    create: { width: 500, height: 700, channels: 3, background: "#555555" },
  })
    .png()
    .toBuffer();
  const assignment = await createAssignment({
    designId: "a0000000-0000-4000-8000-000000000001",
    title: "A real complete title",
    brand: "example.org",
    sources: [
      await describeSource(
        "tee",
        "https://ih1.redbubble.net/image.12.4567/tee.png",
        source,
      ),
    ],
    templateId: "diagonal",
  });
  const jpeg = await renderPin(assignment, { tee: source });
  return {
    source,
    jpeg,
    pin: {
      assignment,
      asset: {
        key: assetKey(assignment),
        sha256: digest(jpeg),
        width: 1000 as const,
        height: 1500 as const,
        bytes: jpeg.length,
      },
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("cloud-first saved Pinterest composition", () => {
  it("returns the cloud JPEG intact without fetching product sources", async () => {
    const { jpeg, pin } = await setup();
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://images.example.org");
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(jpeg)));
    vi.stubGlobal("fetch", fetcher);
    const result = await assignedPinResponse(pin);
    expect(result.cloud).toBe(true);
    expect(Buffer.from(result.bytes)).toEqual(jpeg);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["404", "500", "timeout", "corrupt"])(
    "reproduces exactly the same JPEG after CDN %s",
    async (mode) => {
      const { source, jpeg, pin } = await setup();
      vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://images.example.org");
      const fetcher = vi
        .fn()
        .mockImplementationOnce(() => {
          if (mode === "timeout") throw new Error("timeout");
          return Promise.resolve(
            mode === "corrupt"
              ? new Response("broken")
              : new Response(null, { status: Number(mode) }),
          );
        })
        .mockResolvedValue(new Response(new Uint8Array(source)));
      vi.stubGlobal("fetch", fetcher);
      const result = await assignedPinResponse(pin);
      expect(result.cloud).toBe(false);
      expect(Buffer.from(result.bytes)).toEqual(jpeg);
      expect(String(fetcher.mock.calls[1][0])).toContain("redbubble.net");
    },
  );
  it("fails rather than silently using a different source or composition", async () => {
    const { pin } = await setup();
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("wrong source")),
    );
    await expect(assignedPinResponse(pin)).rejects.toThrow("checksum");
  });
  it("bounds chunked bodies even without content-length", async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(20));
        c.close();
      },
    });
    await expect(readImageResponse(new Response(body), 10)).rejects.toThrow(
      "large",
    );
  });
});
