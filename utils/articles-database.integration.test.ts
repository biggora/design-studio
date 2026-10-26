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
    // These fixed disposable targets never use the project's .env or production database.
    pg("DROP TABLE IF EXISTS public.article_announcements");
    await pool.query("DROP TABLE IF EXISTS article_announcements");
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
    pg(`INSERT INTO article_announcements ("sourceArticleId",blog,"tumblrPostId","tumblrUrl",title,excerpt,"imageUrl","imageSha256","imageAlt",revision,publication)
      VALUES ('legacy','legacy.tumblr.com','1','https://legacy.tumblr.com/post/1/old','Old','Intro','https://images.test/old','${"a".repeat(64)}','Cover','${"b".repeat(64)}','{"title":"legacy"}')`);
    await pool.query(
      "INSERT INTO article_announcements (sourceArticleId,blog,tumblrPostId,tumblrUrl,title,excerpt,imageUrl,imageSha256,imageAlt,revision,publication) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [
        "legacy",
        "legacy.tumblr.com",
        "1",
        "https://legacy.tumblr.com/post/1/old",
        "Old",
        "Intro",
        "https://images.test/old",
        "a".repeat(64),
        "Cover",
        "b".repeat(64),
        JSON.stringify({ title: "legacy" }),
      ],
    );
    for (let n = 0; n < 2; n++) {
      pg(
        readFileSync(
          "init/migrations/015_article_schedules_postgres.sql",
          "utf8",
        ),
      );
      await pool.query(
        readFileSync("init/migrations/015_article_schedules_mysql.sql", "utf8"),
      );
    }
    expect(
      pg(
        `SELECT status || ':' || ("showAt" IS NULL)::text || ':' || (publication->>'title') FROM article_announcements WHERE blog='legacy.tumblr.com'`,
      ),
    ).toBe("automatic:true:legacy");
    const [legacy] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT status, showAt, publication FROM article_announcements WHERE blog='legacy.tumblr.com'",
    );
    expect(legacy[0]).toMatchObject({
      status: "automatic",
      showAt: null,
      publication: { title: "legacy" },
    });
    pg("DELETE FROM article_announcements WHERE blog='legacy.tumblr.com'");
    await pool.query(
      "DELETE FROM article_announcements WHERE blog='legacy.tumblr.com'",
    );
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

  it("uses PostgreSQL UTC timestamps and rejects stale/cancelled schedule releases", () => {
    pg(
      `UPDATE article_announcements SET status='scheduled', "showAt"='2099-10-26T12:30:00+02:00', "scheduleRevision"='one', publication=NULL WHERE blog='shop.tumblr.com';`,
    );
    expect(
      pg(
        `SELECT to_char("showAt" AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') FROM article_announcements WHERE blog='shop.tumblr.com'`,
      ),
    ).toBe("2099-10-26 10:30:00");
    const guard = `WHERE blog='shop.tumblr.com' AND "sourceArticleId"='blg_test' AND "scheduleRevision"='one' AND status='scheduled' AND ("showAt" IS NULL OR "showAt"<=now())`;
    expect(
      pg(
        `WITH changed AS (UPDATE article_announcements SET status='published' ${guard} RETURNING 1) SELECT count(*) FROM changed`,
      ),
    ).toBe("0");
    pg(
      `UPDATE article_announcements SET status='cancelled', "scheduleRevision"='two' WHERE blog='shop.tumblr.com'`,
    );
    expect(
      pg(
        `WITH changed AS (UPDATE article_announcements SET status='published' ${guard} RETURNING 1) SELECT count(*) FROM changed`,
      ),
    ).toBe("0");
    pg(
      `UPDATE article_announcements SET status='scheduled', "showAt"='2000-01-01T00:00:00Z', "scheduleRevision"='three' WHERE blog='shop.tumblr.com'`,
    );
    expect(
      pg(
        `WITH changed AS (UPDATE article_announcements SET status='published', "shownAt"=now(), publication='{"title":"released"}' ${guard.replace("'one'", "'three'")} RETURNING 1) SELECT count(*) FROM changed`,
      ),
    ).toBe("1");
  });

  it("controls a real MySQL schedule, preserves it on ingestion, and invalidates an in-flight check", async () => {
    const db = await import("./database");
    try {
      const future = "2099-10-26T10:30:00.000Z";
      const scheduled = await db.setArticleSchedule(
        article,
        "schedule",
        future,
      );
      expect(scheduled).toMatchObject({
        status: "scheduled",
        showAt: future,
        publication: null,
      });
      await db.upsertArticleAnnouncement({
        ...article,
        title: "Changed content",
      });
      expect((await db.fetchArticleAnnouncements(article))[0]).toMatchObject({
        status: "scheduled",
        showAt: future,
      });
      const captured = await db.setArticleSchedule(article, "now");
      await db.setArticleSchedule(article, "cancel");
      expect(
        await db.saveArticlePublication(
          captured,
          {
            ...article,
            url: article.tumblrUrl,
            publishedAt: new Date().toISOString(),
          },
          new Date().toISOString(),
        ),
      ).toBe(false);
      expect((await db.fetchArticleAnnouncements(article))[0]).toMatchObject({
        status: "cancelled",
        publication: null,
      });
      const due = await db.setArticleSchedule(article, "now");
      const now = new Date().toISOString();
      expect(
        await db.saveArticlePublication(
          due,
          { ...article, url: article.tumblrUrl, publishedAt: now },
          now,
        ),
      ).toBe(true);
      expect((await db.fetchArticleAnnouncements(article))[0]).toMatchObject({
        status: "published",
        shownAt: now,
      });
      await db.upsertArticleAnnouncement(article, future);
      expect((await db.fetchArticleAnnouncements(article))[0]).toMatchObject({
        status: "scheduled",
        showAt: future,
        publication: null,
      });
    } finally {
      await db.closeDatabaseConnections();
    }
  });
});
