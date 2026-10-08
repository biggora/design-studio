import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ListingsError } from "@/lib/listings";

const { upsert, list, summarize } = vi.hoisted(() => ({ upsert: vi.fn(), list: vi.fn(), summarize: vi.fn() }));
vi.mock("@/utils/database", () => ({ upsertSocialPost: upsert, listSocialPosts: list, summarizeSocialPosts: summarize }));
import { POST, GET } from "@/app/api/v1/social-posts/route";
import { GET as SUMMARY } from "@/app/api/v1/social-posts/summary/route";

const sha256 = "f45e5bc7a5342c2caa038c57d9e8c368255701b801efc734f67f06d82e3f1971";
const body = () => ({
  design: { sha256, sourceImageId: 299 },
  post: {
    channel: "pinterest", account: "pinterest:main", variant: "main", externalId: "1234567890",
    url: "https://www.pinterest.com/pin/1234567890/", status: "published", publishedAt: "2026-10-10T09:15:00Z",
  },
});
const auth = { headers: { Authorization: "Bearer test-token" } };
const post = (value: unknown = body(), token: string | null = "test-token") =>
  new Request("http://localhost/api/v1/social-posts", {
    method: "POST", headers: token === null ? {} : { Authorization: `Bearer ${token}` }, body: JSON.stringify(value),
  });
const storedPost = {
  id: "p1", designId: "d1", ...body().post, publishedAt: "2026-10-10T09:15:00.000Z", linkUrl: null, title: null, caption: null,
  hashtags: null, imageUrl: null, board: null, removedAt: null, extra: null,
  createdAt: "2026-10-10T09:16:00.000Z", updatedAt: "2026-10-10T09:16:00.000Z",
};
const result = {
  design: { id: "d1", slug: "space", title: "Space", sha256, sourceImageId: 299 }, post: storedPost, created: true,
};

beforeEach(() => {
  vi.stubEnv("LISTINGS_API_TOKEN", "test-token");
  vi.clearAllMocks();
  upsert.mockResolvedValue(result);
});
afterEach(() => vi.unstubAllEnvs());

describe("social-posts auth", () => {
  it.each([null, "wrong"])("rejects token %s on every method", async token => {
    const headers: Record<string, string> = token === null ? {} : { Authorization: `Bearer ${token}` };
    expect((await POST(post(body(), token))).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/v1/social-posts", { headers }))).status).toBe(401);
    expect((await SUMMARY(new Request("http://localhost/api/v1/social-posts/summary", { headers }))).status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
  });
  it("returns 503 when LISTINGS_API_TOKEN is unset", async () => {
    vi.stubEnv("LISTINGS_API_TOKEN", "");
    expect((await POST(post())).status).toBe(503);
    expect((await GET(new Request("http://localhost/api/v1/social-posts"))).status).toBe(503);
    expect((await SUMMARY(new Request("http://localhost/api/v1/social-posts/summary"))).status).toBe(503);
  });
});

describe("POST /api/v1/social-posts", () => {
  it("returns 201 on create with no-store", async () => {
    const response = await POST(post());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(result);
    expect(upsert).toHaveBeenCalledWith({ ...body(), post: { ...body().post, publishedAt: "2026-10-10T09:15:00.000Z" } });
  });
  it("returns 200 on repeat", async () => {
    upsert.mockResolvedValue({ ...result, created: false });
    expect((await POST(post())).status).toBe(200);
  });
  it("returns 400 for invalid JSON and invalid bodies", async () => {
    const bad = await POST(new Request("http://localhost/api/v1/social-posts", { method: "POST", ...auth, body: "{" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "VALIDATION" });
    const invalid = await POST(post({ ...body(), post: { ...body().post, status: "removed" } }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "VALIDATION", field: "post.removedAt" });
    expect(upsert).not.toHaveBeenCalled();
  });
  it("passes through 404 and 409", async () => {
    upsert.mockRejectedValueOnce(new ListingsError(404, "NOT_FOUND", "Design not found", "design"));
    const notFound = await POST(post());
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: "Design not found", code: "NOT_FOUND", field: "design" });
    upsert.mockRejectedValueOnce(new ListingsError(409, "CONFLICT", "Post belongs to another design", undefined, { designId: "x" }));
    const conflict = await POST(post());
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "Post belongs to another design", code: "CONFLICT", details: { designId: "x" } });
  });
  it("does not leak internal errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    upsert.mockRejectedValueOnce(new Error("secret"));
    const response = await POST(post());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error", code: "INTERNAL" });
    log.mockRestore();
  });
});

describe("GET /api/v1/social-posts", () => {
  it("passes validated filters and returns the pagination shape", async () => {
    const payload = { data: [{ post: storedPost, design: { id: "d1", slug: "space", title: "Space" } }], pagination: { page: 2, limit: 10, total: 11 } };
    list.mockResolvedValue(payload);
    const response = await GET(new Request(`http://localhost/api/v1/social-posts?sha256=${sha256}&channel=pinterest&status=published&page=2&limit=10&q=cat`, auth));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(list).toHaveBeenCalledWith({ sha256, channel: "pinterest", status: "published", q: "cat", page: 2, limit: 10 });
    expect(await response.json()).toEqual(payload);
  });
  it("rejects unknown query keys", async () => {
    const response = await GET(new Request("http://localhost/api/v1/social-posts?foo=1", auth));
    expect(response.status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/social-posts/summary", () => {
  it("returns { data } and forwards the date range", async () => {
    const rows = [{ channel: "pinterest", account: "pinterest:main", status: "published", count: 3 }];
    summarize.mockResolvedValue(rows);
    const response = await SUMMARY(new Request("http://localhost/api/v1/social-posts/summary?since=2026-01-01T00:00:00Z", auth));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(summarize).toHaveBeenCalledWith({ since: "2026-01-01T00:00:00.000Z" });
    expect(await response.json()).toEqual({ data: rows });
  });
  it("rejects invalid ranges", async () => {
    expect((await SUMMARY(new Request("http://localhost/api/v1/social-posts/summary?channel=x", auth))).status).toBe(400);
  });
});
