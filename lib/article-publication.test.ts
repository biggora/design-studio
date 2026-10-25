import { describe, expect, it, vi } from "vitest";
import { resolveArticlePublications } from "./article-publication";
import type { ArticleRecord } from "./articles";
const article: ArticleRecord = {
  sourceArticleId: "blg_test",
  blog: "shop.tumblr.com",
  tumblrPostId: "831330512661610496",
  tumblrUrl: "https://shop.tumblr.com/post/831330512661610496/shrink-jeans",
  title: "How to shrink jeans",
  excerpt: "A practical guide.",
  imageUrl: "https://images.test/cover.png",
  imageSha256: "a".repeat(64),
  imageAlt: "Jeans",
  revision: "r",
  checkedAt: null,
  publication: null,
};
const post = (
  id = article.tumblrPostId,
  slug = "shrink-jeans",
  state = "published",
) => ({
  id_string: id,
  post_url: `https://shop.tumblr.com/post/${id}/${slug}`,
  timestamp: 1792800000,
  state,
});
const response = (posts: unknown[], total = posts.length) =>
  Response.json({
    meta: { status: 200 },
    response: { posts, total_posts: total },
  });
describe("Tumblr publication gate", () => {
  it("uses string IDs, public authentication and actual publication time", async () => {
    const request = vi.fn(async () => response([post()]));
    const result = await resolveArticlePublications([article], "key", request);
    expect(result.get("shop.tumblr.com:blg_test")).toMatchObject({
      url: article.tumblrUrl,
      publishedAt: new Date(1792800000 * 1000).toISOString(),
    });
    const [url, options] = request.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.searchParams.get("id")).toBe("831330512661610496");
    expect(url.searchParams.get("api_key")).toBe("key");
    expect(options.headers).not.toHaveProperty("Authorization");
  });
  it.each(["draft", "queued", "private"])("hides %s posts", async (state) => {
    const result = await resolveArticlePublications(
      [article],
      "key",
      async () => response([post(undefined, undefined, state)]),
    );
    expect(result.get("shop.tumblr.com:blg_test")).toBeNull();
  });
  it("resolves one exact slug beyond the first twenty posts after an ID change", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.searchParams.has("id"))
        return new Response(null, { status: 404 });
      return url.searchParams.get("offset") === "0"
        ? response(
            Array.from({ length: 20 }, (_, i) => post(String(i), `print-${i}`)),
            21,
          )
        : response([post("999")], 21);
    });
    const result = await resolveArticlePublications([article], "key", request);
    expect(result.get("shop.tumblr.com:blg_test")?.url).toBe(
      "https://shop.tumblr.com/post/999/shrink-jeans",
    );
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("hides deleted posts and ambiguous slug matches", async () => {
    for (const posts of [[], [post("8"), post("9")]]) {
      const result = await resolveArticlePublications(
        [article],
        "key",
        async (input) =>
          new URL(String(input)).searchParams.has("id")
            ? new Response(null, { status: 404 })
            : response(posts),
      );
      expect(result.get("shop.tumblr.com:blg_test")).toBeNull();
    }
  });
  it("treats rate errors as unavailable verification", async () => {
    await expect(
      resolveArticlePublications(
        [article],
        "secret",
        async () => new Response(null, { status: 429 }),
      ),
    ).rejects.toThrow("(429)");
  });
  it("rejects unsafe canonical URLs", async () => {
    await expect(
      resolveArticlePublications([article], "key", async () =>
        response([{ ...post(), post_url: "https://evil.test/post" }]),
      ),
    ).rejects.toThrow("unexpected article URL");
  });
});
