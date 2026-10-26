import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ArticleAnnouncement,
  ArticleRecord,
  PublishedArticle,
} from "@/lib/articles";
const state = vi.hoisted(() => ({
  rows: [] as ArticleRecord[],
  saved: [] as Record<string, unknown>[],
  sql: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/article-publication", () => ({
  resolveArticlePublications: state.resolve,
}));
vi.mock("mysql2/promise", () => ({
  default: { createPool: () => ({ query: state.sql, end: vi.fn() }) },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      let update: Record<string, unknown> | undefined;
      const matches = (row: ArticleRecord) =>
        Object.entries(filters).every(
          ([key, value]) =>
            (row[key as keyof ArticleRecord] ??
              (key === "status"
                ? "automatic"
                : key === "scheduleRevision"
                  ? ""
                  : null)) === value,
        );
      const apply = () => {
        const rows = state.rows.filter(matches);
        if (update) {
          state.saved.push({ ...update, filters });
          rows.forEach((row) => Object.assign(row, update));
        }
        return rows;
      };
      const chain = {
        select: () => chain,
        or: () => chain,
        order: () => chain,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return chain;
        },
        range: async () => ({
          data: state.rows.filter(matches).map((row) => ({ ...row })),
          error: null,
        }),
        maybeSingle: async () => ({
          data: (update ? apply()[0] : state.rows.find(matches)) ?? null,
          error: null,
        }),
        upsert: async (value: Record<string, unknown>) => {
          state.saved.push(value);
          return { error: null };
        },
        update: (value: Record<string, unknown>) => {
          update = value;
          return chain;
        },
        then: (resolve: (value: unknown) => unknown) => {
          return Promise.resolve({
            data: apply().map((row) => ({ ...row })),
            error: null,
          }).then(resolve);
        },
      };
      return chain;
    },
  }),
}));
const article: ArticleAnnouncement = {
  sourceArticleId: "blg_test",
  blog: "shop.tumblr.com",
  tumblrPostId: "123",
  tumblrUrl: "https://shop.tumblr.com/post/123/wash",
  title: "Guide",
  excerpt: "Useful",
  imageUrl: "https://images.test/cover.png",
  imageSha256: "a".repeat(64),
  imageAlt: "Cover",
};
const publication: PublishedArticle = {
  ...article,
  url: article.tumblrUrl,
  publishedAt: "2026-10-25T05:00:00Z",
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.rows = [];
  state.saved = [];
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("TUMBLR_API_KEY", "key");
  vi.stubEnv("MYSQL_HOST", "localhost");
  vi.stubEnv("MYSQL_USER", "user");
  vi.stubEnv("MYSQL_PASSWORD", "pass");
  vi.stubEnv("MYSQL_DATABASE", "test");
});
afterEach(() => vi.unstubAllEnvs());
describe.each(["supabase", "mysql"])("article database (%s)", (provider) => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_PROVIDER", provider);
    state.sql.mockImplementation(
      async (sql: string, values: unknown[] = []) => {
        if (sql.startsWith("SELECT"))
          return [
            state.rows
              .filter(
                (row) =>
                  !sql.includes("WHERE") ||
                  (row.blog === values[0] && row.sourceArticleId === values[1]),
              )
              .map((row) => ({
                ...row,
                checkedAt: row.checkedAt?.slice(0, 23).replace("T", " "),
              })),
          ];
        if (sql.startsWith("UPDATE article_announcements SET publication")) {
          const row = state.rows.find(
            (row) =>
              row.blog === values[5] &&
              row.sourceArticleId === values[6] &&
              row.revision === values[7] &&
              (row.scheduleRevision ?? "") === values[8] &&
              (row.status ?? "automatic") === values[9],
          );
          if (row)
            Object.assign(row, {
              publication: values[0] ? JSON.parse(values[0] as string) : null,
              checkedAt: values[1],
              status: values[2],
              shownAt: values[3],
              lastError: values[4],
            });
          return [{ affectedRows: row ? 1 : 0 }];
        }
        if (sql.startsWith("UPDATE article_announcements SET status")) {
          const row = state.rows.find(
            (row) =>
              row.blog === values[3] && row.sourceArticleId === values[4],
          );
          if (row)
            Object.assign(row, {
              status: values[0],
              showAt: values[1],
              scheduleRevision: values[2],
              publication: null,
              checkedAt: null,
              shownAt: null,
              lastError: null,
            });
          return [{ affectedRows: row ? 1 : 0 }];
        }
        return [{}];
      },
    );
  });
  it("writes a stable upsert and retains the last verified snapshot", async () => {
    const db = await import("./database");
    await db.upsertArticleAnnouncement(article);
    if (provider === "supabase")
      expect(state.saved[0]).toMatchObject({ ...article, checkedAt: null });
    else {
      expect(state.sql.mock.calls[0][0]).toContain("ON DUPLICATE KEY UPDATE");
      expect(state.sql.mock.calls[0][1]).toContain("blg_test");
    }
  });
  it("serves fresh verification without contacting Tumblr", async () => {
    state.rows = [
      {
        ...article,
        revision: "r",
        checkedAt: new Date().toISOString(),
        publication,
      },
    ];
    expect(await (await import("./database")).fetchPublishedArticles()).toEqual(
      [publication],
    );
    expect(state.resolve).not.toHaveBeenCalled();
  });
  it("keeps last-good articles after transient errors, without opening unverified cards", async () => {
    state.rows = [
      { ...article, revision: "r", checkedAt: null, publication },
      {
        ...article,
        sourceArticleId: "pending",
        revision: "p",
        checkedAt: null,
        publication: null,
      },
    ];
    state.resolve.mockRejectedValue(new Error("unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await (await import("./database")).fetchPublishedArticles()).toEqual(
      [publication],
    );
    error.mockRestore();
  });
  it("removes an article only after a successful public absence check", async () => {
    state.rows = [{ ...article, revision: "r", checkedAt: null, publication }];
    state.resolve.mockResolvedValue(
      new Map([["shop.tumblr.com:blg_test", null]]),
    );
    expect(await (await import("./database")).fetchPublishedArticles()).toEqual(
      [],
    );
    if (provider === "supabase")
      expect(state.saved[0]).toMatchObject({
        publication: null,
        filters: { revision: "r" },
      });
    else
      expect(
        state.sql.mock.calls.find((call) => call[0].startsWith("UPDATE"))?.[0],
      ).toContain("AND revision = ?");
  });

  it("does not expose a future/cancelled schedule or even a due but unprocessed schedule", async () => {
    state.rows = [
      {
        ...article,
        revision: "r",
        status: "scheduled",
        showAt: new Date(Date.now() + 3_600_000).toISOString(),
        checkedAt: null,
        publication,
      },
      {
        ...article,
        sourceArticleId: "cancelled",
        revision: "r",
        status: "cancelled",
        checkedAt: null,
        publication,
      },
      {
        ...article,
        sourceArticleId: "due",
        revision: "r",
        status: "scheduled",
        showAt: new Date(Date.now() - 1000).toISOString(),
        checkedAt: null,
        publication,
      },
    ];
    expect(await (await import("./database")).fetchPublishedArticles()).toEqual(
      [],
    );
    expect(state.resolve).not.toHaveBeenCalled();
  });

  it("processes due schedules without a visitor and dates the card at website release time", async () => {
    state.rows = [
      {
        ...article,
        revision: "r",
        status: "scheduled",
        showAt: new Date(Date.now() - 1000).toISOString(),
        scheduleRevision: "s",
        checkedAt: null,
        publication: null,
      },
    ];
    state.resolve.mockResolvedValue(
      new Map([["shop.tumblr.com:blg_test", publication]]),
    );
    const db = await import("./database");
    const start = Date.now();
    expect(await db.processArticleAnnouncements()).toMatchObject({
      processed: 1,
      published: 1,
      changed: 1,
    });
    const [saved] = await db.fetchArticleAnnouncements();
    expect(saved.status).toBe("published");
    expect(Date.parse(saved.shownAt!)).toBeGreaterThanOrEqual(start);
    expect(saved.publication?.publishedAt).toBe(saved.shownAt);
    expect(saved.publication?.publishedAt).not.toBe(publication.publishedAt);
    expect(await db.fetchPublishedArticles()).toHaveLength(1);
  });

  it("keeps a due announcement hidden while Tumblr is queued or verification fails", async () => {
    for (const fails of [false, true]) {
      state.rows = [
        {
          ...article,
          revision: "r",
          status: "scheduled",
          showAt: new Date(Date.now() - 1000).toISOString(),
          checkedAt: null,
          publication: null,
        },
      ];
      if (fails)
        state.resolve.mockRejectedValue(new Error("private provider URL"));
      else
        state.resolve.mockResolvedValue(
          new Map([["shop.tumblr.com:blg_test", null]]),
        );
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const db = await import("./database");
      expect(await db.processArticleAnnouncements()).toMatchObject({
        published: 0,
        failed: fails ? 1 : 0,
        waiting: fails ? 0 : 1,
      });
      expect(await db.fetchPublishedArticles()).toEqual([]);
      const [saved] = await db.fetchArticleAnnouncements();
      expect(saved.status).toBe("scheduled");
      expect(saved.lastError).toBe(
        fails ? "tumblr_verification_unavailable" : null,
      );
      error.mockRestore();
    }
  });

  it("rescheduling hides a previously published card and cancellation survives later ingestion", async () => {
    state.rows = [
      {
        ...article,
        revision: "r",
        status: "published",
        checkedAt: null,
        publication,
      },
    ];
    const db = await import("./database");
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(
      (await db.setArticleSchedule(article, "schedule", future)).showAt,
    ).toBe(future);
    expect(await db.fetchPublishedArticles()).toEqual([]);
    expect((await db.setArticleSchedule(article, "cancel")).status).toBe(
      "cancelled",
    );
    await db.upsertArticleAnnouncement(article);
    expect(await db.fetchPublishedArticles()).toEqual([]);
    if (provider === "supabase")
      expect(state.saved.at(-1)).not.toHaveProperty("status");
  });

  it.each(["cancel", "schedule"] as const)(
    "a concurrent %s wins over an in-flight Tumblr check",
    async (action) => {
      state.rows = [
        {
          ...article,
          revision: "r",
          status: "scheduled",
          scheduleRevision: "before",
          showAt: new Date(Date.now() - 1000).toISOString(),
          checkedAt: null,
          publication: null,
        },
      ];
      const db = await import("./database");
      state.resolve.mockImplementation(async () => {
        await db.setArticleSchedule(
          article,
          action,
          new Date(Date.now() + 3_600_000).toISOString(),
        );
        return new Map([["shop.tumblr.com:blg_test", publication]]);
      });
      expect(await db.processArticleAnnouncements()).toMatchObject({
        superseded: 1,
        published: 0,
      });
      expect(await db.fetchPublishedArticles()).toEqual([]);
    },
  );

  it("publish-now changes only the website gate and still waits for Tumblr", async () => {
    state.rows = [
      {
        ...article,
        revision: "r",
        status: "cancelled",
        checkedAt: null,
        publication: null,
      },
    ];
    const db = await import("./database");
    const saved = await db.setArticleSchedule(article, "now");
    expect(saved.status).toBe("scheduled");
    expect(Date.parse(saved.showAt!)).toBeLessThanOrEqual(Date.now());
    state.resolve.mockResolvedValue(
      new Map([["shop.tumblr.com:blg_test", null]]),
    );
    expect(await db.processArticleAnnouncements()).toMatchObject({
      waiting: 1,
      published: 0,
    });
    expect(await db.fetchPublishedArticles()).toEqual([]);
  });
});
it("requires a server service key rather than anonymous access", async () => {
  vi.stubEnv("DATABASE_PROVIDER", "supabase");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  await expect(
    (await import("./database")).fetchArticleAnnouncements(),
  ).rejects.toThrow("SERVICE_ROLE_KEY");
});
