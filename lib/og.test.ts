import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImageDataUrl, loadOgLogo } from "@/lib/og";

const URL_OK = "https://ih1.redbubble.net/image.1/mockup.jpg";

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

describe("loadOgLogo", () => {
  it("returns null instead of throwing when the file is missing", async () => {
    expect(await loadOgLogo("/definitely/not/here/logo.png")).toBeNull();
  });

  it("returns a png data URL for the bundled logo", async () => {
    expect(await loadOgLogo()).toMatch(/^data:image[/]png;base64,/);
  });
});
