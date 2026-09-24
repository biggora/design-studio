import { describe, it, expect, beforeEach, vi } from "vitest";

const revalidateTagMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
}));

vi.mock("@/utils/database", () => ({
  SITE_CONFIG_TAG: "site-config",
}));

describe("POST /api/revalidate/config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SYNC_SECRET", "correct-secret");
    revalidateTagMock.mockClear();
  });

  it("returns 401 and does not revalidate when unauthorized", async () => {
    const { POST } = await import("@/app/api/revalidate/config/route");
    const request = new Request("https://example.com/api/revalidate/config", {
      method: "POST",
      headers: { "x-sync-secret": "wrong-secret" },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("returns 200 and revalidates the site-config tag when authorized", async () => {
    const { POST } = await import("@/app/api/revalidate/config/route");
    const request = new Request("https://example.com/api/revalidate/config", {
      method: "POST",
      headers: { "x-sync-secret": "correct-secret" },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: true, tag: "site-config" });
    expect(revalidateTagMock).toHaveBeenCalledWith("site-config", "max");
  });
});
