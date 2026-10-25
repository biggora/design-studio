import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { save, revalidate } = vi.hoisted(() => ({
  save: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/utils/database", () => ({ upsertArticleAnnouncement: save }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
import { PUT } from "./route";
const body = {
  sourceArticleId: "blg_test",
  blog: "shop.tumblr.com",
  tumblrPostId: "123",
  tumblrUrl: "https://shop.tumblr.com/post/123/guide",
  title: "Guide",
  excerpt: "Introduction",
  imageUrl: `https://images.test/articles/test/${"a".repeat(64)}.png`,
  imageSha256: "a".repeat(64),
  imageAlt: "Cover",
};
const request = (token = "secret", data: unknown = body) =>
  new Request("https://shop.test/api/articles", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SYNC_SECRET", "secret");
  vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://images.test");
  save.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("PUT /api/articles", () => {
  it("authenticates before reading or saving data", async () => {
    expect((await PUT(request("wrong"))).status).toBe(401);
    expect(save).not.toHaveBeenCalled();
  });
  it("rejects invalid payloads", async () => {
    expect(
      (
        await PUT(
          request("secret", { ...body, imageUrl: "https://evil.test/file" }),
        )
      ).status,
    ).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
  it("acknowledges stable identity and revalidates discovery", async () => {
    expect(await (await PUT(request())).json()).toEqual({
      sourceArticleId: "blg_test",
      saved: true,
    });
    expect(save).toHaveBeenCalledWith(body);
    expect(revalidate.mock.calls).toEqual([["/articles"], ["/sitemap.xml"]]);
  });
  it("keeps database errors private", async () => {
    save.mockRejectedValue(new Error("private database connection"));
    const result = await PUT(request());
    expect(result.status).toBe(500);
    expect(await result.text()).not.toContain("private");
  });
});
