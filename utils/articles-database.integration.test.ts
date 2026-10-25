import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import type { ArticleAnnouncement } from "@/lib/articles";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
const enabled = process.env.ARTICLES_TEST_DATABASES === "1";
const mysqlPort = Number(process.env.ARTICLES_MYSQL_PORT || 33327);
const article: ArticleAnnouncement = {
  sourceArticleId: "blg_test",
  blog: "shop.tumblr.com",
  tumblrPostId: "831330512661610496",
  tumblrUrl: "https://shop.tumblr.com/post/831330512661610496/wash",
  title: "Wash",
  excerpt: "Introduction",
  imageUrl: "https://images.test/cover.png",
  imageSha256: "a".repeat(64),
  imageAlt: "Cover",
};
const pg = (sql: string) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "design-studio-articles-postgres",
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "articles_test",
    ],
    { input: sql, encoding: "utf8" },
  ).trim();
describe.skipIf(!enabled)("article migrations on real PostgreSQL/MySQL", () => {
  let pool: mysql.Pool;
  beforeAll(async () => {
    pool = mysql.createPool({
      host: "127.0.0.1",
      port: mysqlPort,
      user: "root",
      password: "articles-test",
      database: "articles_test",
      multipleStatements: true,
    });
    pg(
      "DO $$ BEGIN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    );
  });
  afterAll(async () => {
    await pool?.end();
    vi.unstubAllEnvs();
  });
  it("applies each migration twice and denies PostgreSQL anonymous/authenticated access", async () => {
    for (let n = 0; n < 2; n++) {
      pg(readFileSync("init/migrations/012_articles_postgres.sql", "utf8"));
      await pool.query(
        readFileSync("init/migrations/012_articles_mysql.sql", "utf8"),
      );
    }
    expect(
      pg(
        "SELECT relrowsecurity FROM pg_class WHERE oid='public.article_announcements'::regclass",
      ),
    ).toBe("t");
    expect(
      pg(
        "SELECT has_table_privilege('anon','public.article_announcements','SELECT') OR has_table_privilege('authenticated','public.article_announcements','INSERT')",
      ),
    ).toBe("f");
    expect(
      pg(
        "SELECT has_table_privilege('service_role','public.article_announcements','SELECT,INSERT,UPDATE')",
      ),
    ).toBe("t");
  });
  it("enforces PostgreSQL stable identity while preserving snapshots on upsert", () => {
    pg(`INSERT INTO article_announcements ("sourceArticleId",blog,"tumblrPostId","tumblrUrl",title,excerpt,"imageUrl","imageSha256","imageAlt",revision,publication)
      VALUES ('blg_test','shop.tumblr.com','123','https://shop.tumblr.com/post/123/wash','Guide','Intro','https://images.test/x','${"a".repeat(64)}','Cover','${"b".repeat(64)}','{"title":"old"}')
      ON CONFLICT (blog,"sourceArticleId") DO UPDATE SET title=EXCLUDED.title;
      INSERT INTO article_announcements ("sourceArticleId",blog,"tumblrPostId","tumblrUrl",title,excerpt,"imageUrl","imageSha256","imageAlt",revision)
      VALUES ('blg_test','shop.tumblr.com','123','https://shop.tumblr.com/post/123/wash','Updated','Intro','https://images.test/x','${"a".repeat(64)}','Cover','${"b".repeat(64)}')
      ON CONFLICT (blog,"sourceArticleId") DO UPDATE SET title=EXCLUDED.title;`);
    expect(
      pg(
        "SELECT count(*) || ':' || max(title) || ':' || max(publication->>'title') FROM article_announcements WHERE blog='shop.tumblr.com'",
      ),
    ).toBe("1:Updated:old");
  });
  it("executes real MySQL facade upserts, JSON snapshots and revision guards", async () => {
    for (const [key, value] of Object.entries({
      DATABASE_PROVIDER: "mysql",
      MYSQL_HOST: "127.0.0.1",
        MYSQL_PORT: String(mysqlPort),
      MYSQL_USER: "root",
      MYSQL_PASSWORD: "articles-test",
      MYSQL_DATABASE: "articles_test",
    }))
      vi.stubEnv(key, value);
    const db = await import("./database");
    try {
      await db.upsertArticleAnnouncement(article);
      await db.upsertArticleAnnouncement(article);
      let rows = await db.fetchArticleAnnouncements();
      expect(rows).toHaveLength(1);
      expect(rows[0].tumblrPostId).toBe(article.tumblrPostId);
      const publication = {
        ...article,
        url: article.tumblrUrl,
        publishedAt: "2026-10-25T05:00:00.000Z",
      };
      await db.saveArticlePublication(
        rows[0],
        publication,
        "2026-10-25T06:00:00.000Z",
      );
      await db.upsertArticleAnnouncement(article);
      rows = await db.fetchArticleAnnouncements();
      expect(rows[0].checkedAt).toBe("2026-10-25T06:00:00.000Z");
      expect(rows[0].publication).toEqual(publication);
      const previous = rows[0];
      await db.upsertArticleAnnouncement({ ...article, title: "Updated" });
      await db.saveArticlePublication(
        previous,
        null,
        "2026-10-25T07:00:00.000Z",
      );
      rows = await db.fetchArticleAnnouncements();
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Updated");
      expect(rows[0].checkedAt).toBeNull();
      expect(rows[0].publication).toEqual(publication);
    } finally {
      await db.closeDatabaseConnections();
    }
  });
});
