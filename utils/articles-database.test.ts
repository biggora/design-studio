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
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return chain;
        },
        range: async () => ({
          data: state.rows.map((row) => ({ ...row })),
          error: null,
        }),
        maybeSingle: async () => ({
          data:
            state.rows.find(
              (row) =>
                row.blog === filters.blog &&
                row.sourceArticleId === filters.sourceArticleId,
            ) ?? null,
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
          state.saved.push({ ...update, filters });
          return Promise.resolve({ error: null }).then(resolve);
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
    state.sql.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT")
        ? [
            state.rows.map((row) => ({
              ...row,
              checkedAt: row.checkedAt?.slice(0, 23).replace("T", " "),
            })),
          ]
        : [{}],
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
    else expect(state.sql.mock.calls.at(-1)?.[0]).toContain("AND revision = ?");
  });
});
it("requires a server service key rather than anonymous access", async () => {
  vi.stubEnv("DATABASE_PROVIDER", "supabase");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  await expect(
    (await import("./database")).fetchArticleAnnouncements(),
  ).rejects.toThrow("SERVICE_ROLE_KEY");
});
