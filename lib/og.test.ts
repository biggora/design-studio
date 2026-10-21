import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImageDataUrl, loadOgLogo } from "@/lib/og";
import { isAllowedPinSourceImage } from "@/lib/pin-image";

const URL_OK = "https://ih1.redbubble.net/image.1/mockup.jpg";
const CDN = "https://images.threadquirk.lv";
const SHARE_JPG = `${CDN}/designs/f45e5bc7a5342c2c/share-v1.jpg`;

function stubFetch(impl: () => Promise<unknown>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

function imageResponse(type: string, status = 200) {
  return new Response(new Uint8Array([1, 2, 3]), { status, headers: { "content-type": type } });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchImageDataUrl", () => {
  it("returns a data URL for a jpeg", async () => {
    stubFetch(async () => imageResponse("image/jpeg"));
    expect(await fetchImageDataUrl(URL_OK)).toBe("data:image/jpeg;base64,AQID");
  });

  it("returns null for webp, which satori cannot decode", async () => {
    stubFetch(async () => imageResponse("image/webp"));
    expect(await fetchImageDataUrl(URL_OK)).toBeNull();
  });

  it("returns null for a 404", async () => {
    stubFetch(async () => imageResponse("image/jpeg", 404));
    expect(await fetchImageDataUrl(URL_OK)).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    stubFetch(async () => {
      throw new Error("network down");
    });
    expect(await fetchImageDataUrl(URL_OK)).toBeNull();
  });

  it("returns null when the request times out", async () => {
    const fn = stubFetch(
      () => new Promise((_, reject) => setTimeout(() => reject(new DOMException("timeout", "TimeoutError")), 5)),
    );
    expect(await fetchImageDataUrl(URL_OK, 1)).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not fetch hosts outside the image allowlist", async () => {
    const fn = stubFetch(async () => imageResponse("image/jpeg"));
    expect(await fetchImageDataUrl("https://evil.example.com/a.jpg")).toBeNull();
    expect(await fetchImageDataUrl("/images/no_image_available.svg")).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("isAllowedPinSourceImage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps the Redbubble allowlist and rejects lookalikes and plain http", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    expect(isAllowedPinSourceImage(URL_OK)).toBe(true);
    expect(isAllowedPinSourceImage("https://evil-redbubble.net/a.jpg")).toBe(false);
    expect(isAllowedPinSourceImage("http://ih1.redbubble.net/a.jpg")).toBe(false);
    expect(isAllowedPinSourceImage(SHARE_JPG)).toBe(false);
  });

  it("allows the configured image CDN host", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", CDN);
    expect(isAllowedPinSourceImage(SHARE_JPG)).toBe(true);
    // The share JPEG must stay a JPEG: a webp from the same host stays rejected.
    expect(isAllowedPinSourceImage(`${CDN}/designs/f45e5bc7a5342c2c/card-v1.webp`)).toBe(true);
  });

  it("rejects a lookalike of the CDN host", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", CDN);
    expect(isAllowedPinSourceImage("https://images.threadquirk.lv.evil.example/share-v1.jpg")).toBe(false);
    expect(isAllowedPinSourceImage("https://images.threadquirk.lv.evil.example")).toBe(false);
  });

  it("rejects http: even on the CDN host", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", CDN);
    expect(isAllowedPinSourceImage("http://images.threadquirk.lv/share-v1.jpg")).toBe(false);
  });
});

describe("loadOgLogo", () => {
  it("returns null instead of throwing when the file is missing", async () => {
    expect(await loadOgLogo("/definitely/not/here/logo.png")).toBeNull();
  });

  it("returns a png data URL for the bundled logo", async () => {
    expect(await loadOgLogo()).toMatch(/^data:image[/]png;base64,/);
  });
});
