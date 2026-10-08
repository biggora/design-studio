import { describe, expect, it } from "vitest";
import { parseSocialPostInput, parseSocialPostQuery, parseSummaryQuery } from "@/lib/social-posts";
import { ListingsError } from "@/lib/listings";

const sha256 = "f45e5bc7a5342c2caa038c57d9e8c368255701b801efc734f67f06d82e3f1971";
const post = (over: Record<string, unknown> = {}) => ({
  channel: "pinterest", account: "pinterest:main", variant: "main", externalId: "1234567890",
  url: "https://www.pinterest.com/pin/1234567890/", status: "published", publishedAt: "2026-10-10T09:15:00Z", ...over,
});
const body = (over: Record<string, unknown> = {}, design: Record<string, unknown> = { sha256, sourceImageId: 299 }) => ({ design, post: post(over) });
const fieldOf = (fn: () => unknown) => {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(ListingsError); expect((e as ListingsError).status).toBe(400); return (e as ListingsError).field; }
  throw new Error("expected validation error");
};

describe("parseSocialPostInput", () => {
  it("accepts a full valid body and normalizes", () => {
    const out = parseSocialPostInput(body({ linkUrl: "https://www.redbubble.com/x", title: "t", caption: "c", hashtags: ["a"], imageUrl: "https://i.example/x.png", board: "b", extra: { a: 1 }, publishedAt: "2026-10-10T12:15:00+03:00" }, { sha256: sha256.toUpperCase() }));
    expect(out.design).toEqual({ sha256 });
    expect(out.post.publishedAt).toBe("2026-10-10T09:15:00.000Z");
  });
  it.each([
    ["unknown root", { ...body(), x: 1 }, "x"],
    ["unknown design key", { ...body(), design: { sha256, x: 1 } }, "design.x"],
    ["unknown post key", body({ x: 1 }), "post.x"],
    ["no design identifiers", body({}, {}), "design"],
    ["null optional", body({ title: null }), "post.title"],
    ["bad channel", body({ channel: "myspace" }), "post.channel"],
    ["bad status", body({ status: "draft" }), "post.status"],
    ["bad url", body({ url: "not a url" }), "post.url"],
    ["credentials", body({ url: "https://u:p@www.pinterest.com/pin/1" }), "post.url"],
    ["javascript linkUrl", body({ linkUrl: "javascript:alert(1)" }), "post.linkUrl"],
    ["bad timestamp", body({ publishedAt: "yesterday" }), "post.publishedAt"],
    ["bad calendar date", body({ publishedAt: "2026-02-31T08:10:00Z" }), "post.publishedAt"],
    ["long account", body({ account: "x".repeat(101) }), "post.account"],
    ["long variant", body({ variant: "x".repeat(51) }), "post.variant"],
    ["long externalId", body({ externalId: "x".repeat(201) }), "post.externalId"],
    ["removed without removedAt", body({ status: "removed" }), "post.removedAt"],
    ["published with removedAt", body({ removedAt: "2026-10-11T00:00:00Z" }), "post.removedAt"],
    ["too many hashtags", body({ hashtags: Array(51).fill("a") }), "post.hashtags"],
    ["empty hashtag", body({ hashtags: [""] }), "post.hashtags.0"],
    ["long hashtag", body({ hashtags: ["x".repeat(101)] }), "post.hashtags.0"],
    ["oversized extra", body({ extra: { d: "x".repeat(16384) } }), "post.extra"],
    ["array extra", body({ extra: [] }), "post.extra"],
    ["bad sha256", body({}, { sha256: "bad" }), "design.sha256"],
    ["bad sourceImageId", body({}, { sourceImageId: 0 }), "design.sourceImageId"],
  ])("rejects %s", (_name, value, field) => {
    expect(fieldOf(() => parseSocialPostInput(value))).toBe(field);
  });

  it.each([
    ["pinterest", "https://evil.example/pin/1"], ["pinterest", "https://pinterest.evil.com/pin/1"],
    ["pinterest", "https://notpinterest.com/pin/1"], ["pinterest", "https://pinterest.com.evil.example/pin/1"],
    ["bluesky", "https://bsky.app.evil.example/x"], ["instagram", "https://notinstagram.com/p/1"],
    ["x", "https://nottwitter.com/a/status/1"], ["youtube", "https://youtube.com.evil.example/watch"],
    ["reddit", "https://evilreddit.com/r/x"], ["linkedin", "https://linkedin.evil.com/x"],
  ])("rejects look-alike host for %s: %s", (channel, url) => {
    expect(fieldOf(() => parseSocialPostInput(body({ channel, url })))).toBe("post.url");
  });
  it.each([
    ["pinterest", "https://www.pinterest.co.uk/pin/1"], ["pinterest", "https://pinterest.de/pin/1"],
    ["pinterest", "https://pinterest.com.au/pin/1"], ["pinterest", "https://pinterest.com/pin/1"],
    ["bluesky", "https://bsky.app/profile/a/post/1"], ["instagram", "https://www.instagram.com/p/1"],
    ["threads", "https://www.threads.net/@a/post/1"], ["threads", "https://threads.com/@a/post/1"],
    ["reddit", "https://old.reddit.com/r/x/comments/1"], ["tiktok", "https://www.tiktok.com/@a/video/1"],
    ["youtube", "https://youtu.be/abc"], ["youtube", "https://www.youtube.com/watch?v=1"],
    ["x", "https://x.com/a/status/1"], ["x", "https://twitter.com/a/status/1"],
    ["linkedin", "https://www.linkedin.com/posts/1"], ["mastodon", "https://any.instance.example/@a/1"],
  ])("accepts %s host %s", (channel, url) => {
    expect(parseSocialPostInput(body({ channel, url })).post.url).toBe(url);
  });
  it("accepts removed with removedAt, and removedAt before publishedAt", () => {
    const out = parseSocialPostInput(body({ status: "removed", removedAt: "2020-01-01T00:00:00Z" }));
    expect(out.post.removedAt).toBe("2020-01-01T00:00:00.000Z");
  });
  it("accepts exactly 50 hashtags and a design with only sourceImageId", () => {
    expect(parseSocialPostInput(body({ hashtags: Array(50).fill("a") }, { sourceImageId: 5 })).design).toEqual({ sourceImageId: 5 });
  });
});

describe("parseSocialPostQuery", () => {
  const q = (s: string) => parseSocialPostQuery(new URLSearchParams(s));
  it("applies defaults", () => expect(q("")).toEqual({ page: 1, limit: 50 }));
  it("parses all filters", () => {
    expect(q(`sha256=${sha256.toUpperCase()}&channel=pinterest&account=a&status=removed&since=2026-01-01T00:00:00Z&until=2026-02-01T00:00:00Z&q=%20cat%20&page=2&limit=200`)).toEqual({
      sha256, channel: "pinterest", account: "a", status: "removed", since: "2026-01-01T00:00:00.000Z",
      until: "2026-02-01T00:00:00.000Z", q: "cat", page: 2, limit: 200,
    });
    expect(q("sourceImageId=299").sourceImageId).toBe(299);
  });
  it.each([
    "unknown=1", `sha256=${sha256}&sourceImageId=1`, "sha256=bad", "sourceImageId=0", "channel=nope", "status=x",
    "page=0", "page=1.5", "limit=0", "limit=201", "limit=abc", "q=", "q=%20", `q=${"x".repeat(201)}`,
    "since=2026-02-01T00:00:00Z&until=2026-01-01T00:00:00Z", "since=yesterday", "page=1&page=2",
  ])("rejects %s", s => expect(() => q(s)).toThrow(ListingsError));
});

describe("parseSummaryQuery", () => {
  it("accepts since/until only", () => {
    expect(parseSummaryQuery(new URLSearchParams("since=2026-01-01T00:00:00Z"))).toEqual({ since: "2026-01-01T00:00:00.000Z" });
    expect(parseSummaryQuery(new URLSearchParams(""))).toEqual({});
  });
  it.each(["channel=x", "since=bad", "since=2026-02-01T00:00:00Z&until=2026-01-01T00:00:00Z"])("rejects %s", s => {
    expect(() => parseSummaryQuery(new URLSearchParams(s))).toThrow(ListingsError);
  });
});
