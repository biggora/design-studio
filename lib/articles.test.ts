import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArticleAnnouncement } from "./articles";
const valid = {
  sourceArticleId: "blg_test",
  blog: "shop.tumblr.com",
  tumblrPostId: "831330512661610496",
  tumblrUrl:
    "https://shop.tumblr.com/post/831330512661610496/shrink-jeans?utm_source=facebook",
  title: "How to shrink jeans",
  excerpt: "A useful introduction.",
  imageSha256: "a".repeat(64),
  imageUrl: `https://images.test/articles/blg_test/${"a".repeat(64)}.png`,
  imageAlt: "Jeans on a table",
};
afterEach(() => vi.unstubAllEnvs());
describe("article validation", () => {
  it("keeps string IDs and strips Facebook tracking", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://images.test");
    expect(parseArticleAnnouncement(valid)).toMatchObject({
      tumblrPostId: valid.tumblrPostId,
      tumblrUrl: valid.tumblrUrl.split("?")[0],
    });
  });
  it.each([
    { tumblrPostId: 831330512661610496 },
    { blog: "evil.test" },
    { tumblrUrl: "https://else.tumblr.com/post/1/jeans" },
    { imageUrl: "https://facebook.test/image.jpg" },
    { imageSha256: "bad" },
    { excerpt: "" },
  ])("rejects %j", (change) => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://images.test");
    expect(() => parseArticleAnnouncement({ ...valid, ...change })).toThrow();
  });
});
