import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { read, set, process, invalidate } = vi.hoisted(() => ({
  read: vi.fn(),
  set: vi.fn(),
  process: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/utils/database", () => ({
  fetchArticleAnnouncements: read,
  setArticleSchedule: set,
  processArticleAnnouncements: process,
}));
vi.mock("next/cache", () => ({ revalidatePath: invalidate }));
import { GET, PUT, DELETE } from "./route";
import { POST as publish } from "./publish/route";
import { GET as cron, POST as tick } from "../process/route";
import { ArticleScheduleError } from "@/lib/article-scheduling";

const target = { blog: "shop.tumblr.com", sourceArticleId: "blg_test" };
const scheduled = {
  ...target,
  status: "scheduled",
  showAt: "2099-10-26T10:00:00.000Z",
  publication: null,
};
const request = (
  body: unknown = { ...target, showAt: "2099-10-26T12:00:00+02:00" },
  token = "secret",
  query = "",
) =>
  new Request(`https://site.test/api/articles/schedule${query}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SYNC_SECRET", "secret");
  read.mockResolvedValue([scheduled]);
  set.mockResolvedValue(scheduled);
  process.mockResolvedValue({ processed: 1, waiting: 1, published: 0 });
});
afterEach(() => vi.unstubAllEnvs());
describe("private announcement scheduling APIs", () => {
  it.each([GET, PUT, DELETE, publish, cron, tick])(
    "requires SYNC_SECRET before reading or writing",
    async (handler) => {
      expect((await handler(request({}, "wrong"))).status).toBe(401);
      expect(read).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
      expect(process).not.toHaveBeenCalled();
    },
  );
  it("fails closed when SYNC_SECRET is not configured", async () => {
    vi.stubEnv("SYNC_SECRET", "");
    expect((await cron(request())).status).toBe(500);
    expect(process).not.toHaveBeenCalled();
  });
  it("creates or moves a schedule in UTC and invalidates public discovery", async () => {
    const response = await PUT(request());
    expect(set).toHaveBeenCalledWith(target, "schedule", scheduled.showAt);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ state: "waiting_time" });
    expect(invalidate.mock.calls).toEqual([["/articles"], ["/sitemap.xml"]]);
  });
  it("reads one record or a filtered paginated list without public caching", async () => {
    const single = await GET(
      request({}, "secret", "?blog=shop.tumblr.com&sourceArticleId=blg_test"),
    );
    expect(read).toHaveBeenCalledWith(target);
    expect((await single.json()).sourceArticleId).toBe("blg_test");
    const list = await GET(
      request({}, "secret", "?status=scheduled&page=1&limit=10"),
    );
    expect(await list.json()).toMatchObject({
      data: [{ status: "scheduled" }],
      pagination: { total: 1, limit: 10 },
    });
    expect(list.headers.get("Cache-Control")).toBe("no-store");
  });
  it("cancels a schedule and invalidates caches immediately", async () => {
    set.mockResolvedValue({ ...scheduled, status: "cancelled", showAt: null });
    expect((await (await DELETE(request(target))).json()).state).toBe(
      "cancelled",
    );
    expect(set).toHaveBeenCalledWith(target, "cancel");
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
  it("publish-now still runs Tumblr verification and may remain waiting", async () => {
    read.mockResolvedValue([{ ...scheduled, showAt: "2000-01-01T00:00:00Z" }]);
    const response = await publish(request(target));
    expect(set).toHaveBeenCalledWith(target, "now");
    expect(process).toHaveBeenCalledWith({ target });
    expect(await response.json()).toMatchObject({
      article: { state: "waiting_tumblr" },
      processing: { published: 0 },
    });
  });
  it.each([cron, tick])(
    "processes due records independently of page requests",
    async (handler) => {
      expect((await handler(request({}, "secret", "?limit=10"))).status).toBe(
        200,
      );
      expect(process).toHaveBeenCalledWith({ limit: 10 });
      expect(invalidate).toHaveBeenCalledTimes(2);
    },
  );
  it("rejects naive times, invalid filters and missing records", async () => {
    expect(
      (await PUT(request({ ...target, showAt: "2026-10-26T12:00:00" }))).status,
    ).toBe(400);
    expect((await GET(request({}, "secret", "?status=unknown"))).status).toBe(
      400,
    );
    expect((await tick(request({}, "secret", "?limit=0"))).status).toBe(400);
    set.mockRejectedValue(
      new ArticleScheduleError("Article announcement not found", 404),
    );
    expect((await DELETE(request(target))).status).toBe(404);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("invalidates discovery even if a processing batch fails after a partial write", async () => {
    process.mockRejectedValue(new Error("private database connection"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await tick(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private");
    expect(invalidate.mock.calls).toEqual([["/articles"], ["/sitemap.xml"]]);
    log.mockRestore();
  });
});
