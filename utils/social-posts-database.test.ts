import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { ListingsError } from "@/lib/listings";
import {
  SocialPost, SocialPostIngestInput, SocialPostIngestResult, SocialPostList, SocialSummaryRow,
  parseSocialPostInput, parseSocialPostQuery, parseSummaryQuery,
} from "@/lib/social-posts";
import { listSocialPostsMySQL, summarizeSocialPostsMySQL, upsertSocialPostMySQL } from "@/utils/social-posts-database";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
const exec = promisify(execFile);
const pgContainer = "design-studio-listings-postgres";
// A database of its own inside the shared disposable containers, so this file can run in
// parallel with listings-database.test.ts (which drops and rebuilds `listings_test`).
const database = "social_posts_test";
const runDbTests = process.env.LISTINGS_TEST_DATABASES === "1";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
type Outcome = { status: number; message?: string; result?: SocialPostIngestResult };
type Listing = { externalIds: string[]; total: number; data: SocialPostList["data"] };

type PostOverrides = Record<string, unknown>;
function body(post: PostOverrides = {}, design: Record<string, unknown> = { sha256: SHA_A, sourceImageId: 299 }): SocialPostIngestInput {
  return parseSocialPostInput({
    design,
    post: {
      channel: "pinterest", account: "pinterest:main", variant: "pin", externalId: "p1",
      url: "https://www.pinterest.com/pin/p1/", status: "published", publishedAt: "2026-10-01T10:00:00.000Z", ...post,
    },
  });
}
const ms = (value: string | null) => value === null ? null : new Date(value).getTime();
const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
async function pgSql(sql: string, db = database): Promise<string> {
  const { stdout } = await exec("docker", ["exec", pgContainer, "psql", "-X", "-qAt", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-c", sql]);
  return stdout.trim();
}

// Explicit opt-in, fixed disposable local targets, and no .env loading. These tests
// must never use the deployment's Supabase URL or MYSQL_* settings.
describe.skipIf(!runDbTests).each(["postgres", "mysql"] as const)("social posts (%s)", provider => {
  let pool: mysql.Pool;
  const pg = provider === "postgres";
  const sourceCol = pg ? '"sourceImageId"' : "sourceImageId";
  const query = async (sql: string): Promise<Record<string, unknown>[]> => {
    if (pg) return JSON.parse(await pgSql(`SELECT coalesce(json_agg(t), '[]'::json) FROM (${sql}) t`));
    const [rows] = await pool.query<mysql.RowDataPacket[]>(sql);
    return rows;
  };
  const execute = async (sql: string) => { if (pg) await pgSql(sql); else await pool.query(sql); };
  const rpc = (fn: string, payload: unknown) => pgSql(`SET ROLE service_role; SELECT public.${fn}(${sqlString(JSON.stringify(payload))}::jsonb)`);
  const posts = () => query("SELECT * FROM design_social_posts");
  const designIds: Record<string, string> = {};
  const seedDesign = async (key: string, title: string, sha: string, sourceImageId: number) => {
    designIds[key] = randomUUID();
    await execute(`INSERT INTO designs (id, title, description, keywords, sha256, ${sourceCol}) VALUES ('${designIds[key]}', ${sqlString(title)}, '', '', '${sha}', ${sourceImageId})`);
  };

  // Normalizes both providers to HTTP-like statuses: 201 created, 200 updated, 404 unknown design, 409 conflict.
  const upsert = async (input: SocialPostIngestInput): Promise<Outcome> => {
    if (!pg) {
      try {
        const result = await upsertSocialPostMySQL(pool, input);
        return { status: result.created ? 201 : 200, result };
      } catch (error) {
        if (error instanceof ListingsError) {
          if (error.status === 404) expect(error.field).toBe("design");
          return { status: error.status, message: error.message };
        }
        throw error;
      }
    }
    try {
      const result: SocialPostIngestResult = JSON.parse(await rpc("upsert_design_social_post", input));
      return { status: result.created ? 201 : 200, result };
    } catch (error) {
      const match = /ERROR:\s+(P000[12]):\s*(.*)/.exec((error as { stderr?: string }).stderr ?? "");
      if (!match) throw error;
      return { status: match[1] === "P0002" ? 404 : 409, message: match[2] };
    }
  };
  const ok = async (input: SocialPostIngestInput): Promise<SocialPostIngestResult> => {
    const outcome = await upsert(input);
    expect([200, 201], outcome.message).toContain(outcome.status);
    return outcome.result!;
  };
  const list = async (params: Record<string, string> = {}): Promise<Listing> => {
    const filters = parseSocialPostQuery(new URLSearchParams(params));
    let data: SocialPostList["data"];
    let total: number;
    if (pg) {
      const result: { data: SocialPostList["data"]; total: number } = JSON.parse(await rpc("list_design_social_posts", filters));
      ({ data, total } = result);
    } else {
      ({ data, pagination: { total } } = await listSocialPostsMySQL(pool, filters));
    }
    return { externalIds: data.map(item => item.post.externalId), total, data };
  };
  const summary = async (params: Record<string, string> = {}): Promise<SocialSummaryRow[]> => {
    const filters = parseSummaryQuery(new URLSearchParams(params));
    if (!pg) return summarizeSocialPostsMySQL(pool, filters);
    return (JSON.parse(await rpc("summarize_design_social_posts", filters)) as { data: SocialSummaryRow[] }).data;
  };

  beforeAll(async () => {
    if (pg) {
      await pgSql(`CREATE DATABASE ${database}`, "postgres").catch((error: Error) => { if (!/already exists/.test(error.message)) throw error; });
      await pgSql("DO $$ BEGIN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;");
      // Upgrade a pre-ingest install, then apply 003 and 004 twice to prove rerunnability.
      const schema = readFileSync("init/postgres_tables.sql", "utf8").split("CREATE TABLE IF NOT EXISTS public.design_listings")[0]
        .replace('"externalId" bigint null,', '"externalId" bigint not null,')
        .replace(/^.*(?:"sourceImageId" bigint|sha256 text|source text).*\r?\n/gm, "");
      await pgSql(schema);
      for (let run = 0; run < 2; run++) {
        await pgSql(readFileSync("init/migrations/003_design_listings_postgres.sql", "utf8"));
        await pgSql(readFileSync("init/migrations/004_design_social_posts_postgres.sql", "utf8"));
      }
      await pgSql("GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;");
    } else {
      const connection = { host: "127.0.0.1", port: 33316, user: "root", password: "listings-test" };
      const admin = await mysql.createConnection(connection);
      await admin.query(`CREATE DATABASE IF NOT EXISTS ${database}`);
      await admin.end();
      pool = mysql.createPool({ ...connection, database, dateStrings: true, multipleStatements: true });
      await pool.query("DROP TABLE IF EXISTS design_social_posts, design_listings, design_collections, collections, designs, studio");
      const schema = readFileSync("init/mysql_tables.sql", "utf8").split("CREATE TABLE design_listings")[0]
        .replace('`externalId` BIGINT NULL,', '`externalId` BIGINT NOT NULL,')
        .replace('title VARCHAR(500) NOT NULL,', 'title VARCHAR(255) NOT NULL,')
        .replace(/^.*(?:`sourceImageId` BIGINT|sha256 VARCHAR|source TEXT).*\r?\n/gm, "");
      await pool.query(schema);
      for (let run = 0; run < 2; run++) {
        await pool.query(readFileSync("init/migrations/003_design_listings_mysql.sql", "utf8"));
        await pool.query(readFileSync("init/migrations/004_design_social_posts_mysql.sql", "utf8"));
      }
    }
  }, 60000);
  beforeEach(async () => {
    await execute("DELETE FROM designs");
    await seedDesign("a", "Space cat", SHA_A, 299);
    await seedDesign("b", "Other design", SHA_B, 300);
  });
  afterAll(async () => { if (pool) await pool.end(); });

  describe("design lookup", () => {
    it("creates a post by sha256 only and by sourceImageId only", async () => {
      const bySha = await upsert(body({ externalId: "p1" }, { sha256: SHA_A }));
      expect(bySha.status).toBe(201);
      expect(bySha.result!.design).toMatchObject({ id: designIds.a, title: "Space cat", sha256: SHA_A, sourceImageId: 299 });
      const bySource = await upsert(body({ externalId: "p2", variant: "story" }, { sourceImageId: 299 }));
      expect(bySource.status).toBe(201);
      expect(bySource.result!.post.designId).toBe(designIds.a);
    });
    it("falls back to sourceImageId when the sha256 is unknown", async () => {
      const outcome = await upsert(body({}, { sha256: "c".repeat(64), sourceImageId: 300 }));
      expect(outcome.status).toBe(201);
      expect(outcome.result!.post.designId).toBe(designIds.b);
    });
    it("returns 404 for an unknown design and leaves no rows", async () => {
      expect((await upsert(body({}, { sha256: "c".repeat(64) }))).status).toBe(404);
      expect((await upsert(body({}, { sha256: "c".repeat(64), sourceImageId: 999 }))).status).toBe(404);
      expect(await posts()).toHaveLength(0);
    });
    it("returns 409 when sha256 and sourceImageId identify different designs, leaving no rows", async () => {
      const outcome = await upsert(body({}, { sha256: SHA_A, sourceImageId: 300 }));
      expect(outcome.status).toBe(409);
      expect(outcome.message).toMatch(/different designs/i);
      expect(await posts()).toHaveLength(0);
    });
    it("accepts sha256 and sourceImageId that agree", async () => {
      expect((await upsert(body({}, { sha256: SHA_B, sourceImageId: 300 }))).result!.post.designId).toBe(designIds.b);
    });
  });

  describe("upsert", () => {
    it("is idempotent: a repeat is created:false, keeps one row and updatedAt >= createdAt", async () => {
      const first = await upsert(body());
      const second = await upsert(body());
      expect([first.status, second.status]).toEqual([201, 200]);
      expect(first.result!.created).toBe(true);
      expect(second.result!.created).toBe(false);
      expect(second.result!.post.id).toBe(first.result!.post.id);
      expect(ms(second.result!.post.createdAt)).toBe(ms(first.result!.post.createdAt));
      expect(ms(second.result!.post.updatedAt)!).toBeGreaterThanOrEqual(ms(second.result!.post.createdAt)!);
      expect(await posts()).toHaveLength(1);
    });
    it("stores optional fields on create and a published post has no removedAt", async () => {
      const { post } = await ok(body({
        linkUrl: "https://example.com/shop/space-cat", title: "Cosmic pin", caption: "Look!", hashtags: ["space", "cat"],
        imageUrl: "https://i.pinimg.com/1.jpg", board: "Cats", extra: { campaign: { id: 7 } },
      }));
      expect(post).toMatchObject({
        channel: "pinterest", account: "pinterest:main", variant: "pin", externalId: "p1", status: "published",
        linkUrl: "https://example.com/shop/space-cat", title: "Cosmic pin", caption: "Look!", hashtags: ["space", "cat"],
        imageUrl: "https://i.pinimg.com/1.jpg", board: "Cats", removedAt: null, extra: { campaign: { id: 7 } },
      });
      expect(ms(post.publishedAt)).toBe(Date.parse("2026-10-01T10:00:00.000Z"));
    });
    it("repeat changes only provided optional fields; status, publishedAt, account, variant and url always update", async () => {
      const first = (await ok(body({
        linkUrl: "https://example.com/a", title: "T", caption: "Old", hashtags: ["x"], imageUrl: "https://i.pinimg.com/1.jpg", board: "B", extra: { k: 1 },
      }))).post;
      const second = (await ok(body({
        caption: "New", account: "pinterest:second", variant: "pin2", url: "https://www.pinterest.com/pin/p1-moved/",
        publishedAt: "2026-10-02T11:30:00.000Z",
      }))).post;
      expect(second).toMatchObject({
        id: first.id, caption: "New", account: "pinterest:second", variant: "pin2", url: "https://www.pinterest.com/pin/p1-moved/",
        linkUrl: "https://example.com/a", title: "T", hashtags: ["x"], imageUrl: "https://i.pinimg.com/1.jpg", board: "B", extra: { k: 1 },
      });
      expect(ms(second.publishedAt)).toBe(Date.parse("2026-10-02T11:30:00.000Z"));
      const [row] = await posts();
      expect(row).toMatchObject({ account: "pinterest:second", variant: "pin2" });
    });
    it("a repeat that provides a field overwrites it", async () => {
      await ok(body({ title: "T", hashtags: ["x"], extra: { k: 1 } }));
      const { post } = await ok(body({ title: "T2", hashtags: ["y", "z"], extra: { k: 2 } }));
      expect(post).toMatchObject({ title: "T2", hashtags: ["y", "z"], extra: { k: 2 } });
    });
    it("marks a post removed, then allows removed -> removed with a corrected removedAt", async () => {
      await ok(body());
      const removed = (await ok(body({ status: "removed", removedAt: "2026-10-03T09:00:00.000Z" }))).post;
      expect(removed.status).toBe("removed");
      expect(ms(removed.removedAt)).toBe(Date.parse("2026-10-03T09:00:00.000Z"));
      const corrected = await upsert(body({ status: "removed", removedAt: "2026-10-04T12:00:00.000Z" }));
      expect(corrected.status).toBe(200);
      expect(corrected.result!.created).toBe(false);
      expect(ms(corrected.result!.post.removedAt)).toBe(Date.parse("2026-10-04T12:00:00.000Z"));
      expect(await posts()).toHaveLength(1);
    });
    it("creates a post that is already removed", async () => {
      const outcome = await upsert(body({ status: "removed", removedAt: "2026-10-03T09:00:00.000Z" }));
      expect(outcome.status).toBe(201);
      expect(outcome.result!.post.status).toBe("removed");
    });
    it("rejects removed -> published with 409 and leaves the row untouched", async () => {
      await ok(body());
      await ok(body({ status: "removed", removedAt: "2026-10-03T09:00:00.000Z" }));
      const [before] = await posts();
      const outcome = await upsert(body({ url: "https://www.pinterest.com/pin/changed/", caption: "changed" }));
      expect(outcome.status).toBe(409);
      expect(outcome.message).toMatch(/removed post/i);
      expect(await posts()).toEqual([before]);
    });
    it("rejects a (channel, externalId) owned by another design and never relinks it", async () => {
      await ok(body());
      const [before] = await posts();
      const outcome = await upsert(body({ variant: "other" }, { sha256: SHA_B }));
      expect(outcome.status).toBe(409);
      expect(outcome.message).toMatch(/another design/i);
      expect(await posts()).toEqual([before]);
    });
    it("allows the same externalId on a different channel", async () => {
      await ok(body());
      const outcome = await upsert(body({ channel: "bluesky", account: "bluesky:main", url: "https://bsky.app/profile/x/post/p1" }, { sha256: SHA_B }));
      expect(outcome.status).toBe(201);
      expect(await posts()).toHaveLength(2);
    });
    it("rejects a different externalId for the same design/channel/account/variant and leaves no new row", async () => {
      await ok(body());
      const outcome = await upsert(body({ externalId: "p2" }));
      expect(outcome.status).toBe(409);
      expect(outcome.message).toMatch(/Account already/i);
      const rows = await posts();
      expect(rows).toHaveLength(1);
      expect(rows[0].externalId).toBe("p1");
    });
    it("allows another variant or another account for the same design", async () => {
      await ok(body());
      expect((await upsert(body({ externalId: "p2", variant: "story" }))).status).toBe(201);
      expect((await upsert(body({ externalId: "p3", account: "pinterest:second" }))).status).toBe(201);
      expect(await posts()).toHaveLength(3);
    });
    it("five parallel identical upserts create exactly one row with one created:true", async () => {
      const outcomes = await Promise.all(Array.from({ length: 5 }, () => upsert(body({ caption: "race" }))));
      expect(outcomes.map(o => o.status).sort()).toEqual([200, 200, 200, 200, 201]);
      expect(outcomes.filter(o => o.result?.created)).toHaveLength(1);
      expect(await posts()).toHaveLength(1);
    }, 60000);
  });

  describe("list and summary", () => {
    const seedPosts = async () => {
      const at = (day: number) => `2026-10-0${day}T10:00:00.000Z`;
      await ok(body({ externalId: "p1", title: "Cosmic Cat Board", caption: "Hello World", publishedAt: at(1) }));
      await ok(body({ channel: "bluesky", account: "bluesky:main", variant: "post", externalId: "b1", url: "https://bsky.app/profile/x/post/b1", caption: "50% off_sale", publishedAt: at(2) }));
      await ok(body({ externalId: "p2", caption: "C:\\temp", publishedAt: at(3) }, { sha256: SHA_B }));
      await ok(body({ externalId: "p3", variant: "story", publishedAt: at(3) }, { sha256: SHA_B }));
      // Published first, then removed: creating a post directly as removed has its own test.
      const toot = { channel: "mastodon", account: "mastodon:alt", variant: "toot", externalId: "m1", url: "https://mastodon.social/@x/1", publishedAt: at(4) };
      await ok(body(toot, { sha256: SHA_B }));
      await ok(body({ ...toot, status: "removed", removedAt: at(5) }, { sha256: SHA_B }));
    };
    const ids = async (params: Record<string, string>) => (await list(params)).externalIds.sort();

    it("filters by sha256 and by sourceImageId; an unknown design is empty", async () => {
      await seedPosts();
      expect(await ids({ sha256: SHA_A })).toEqual(["b1", "p1"]);
      expect(await ids({ sourceImageId: "300" })).toEqual(["m1", "p2", "p3"]);
      expect(await list({ sha256: "f".repeat(64) })).toMatchObject({ externalIds: [], total: 0 });
      expect(await list({ sourceImageId: "12345" })).toMatchObject({ externalIds: [], total: 0 });
    });
    it("filters by channel, account and status", async () => {
      await seedPosts();
      expect(await ids({ channel: "pinterest" })).toEqual(["p1", "p2", "p3"]);
      expect(await ids({ account: "mastodon:alt" })).toEqual(["m1"]);
      expect(await ids({ status: "removed" })).toEqual(["m1"]);
      expect(await ids({ channel: "pinterest", status: "published", sha256: SHA_B })).toEqual(["p2", "p3"]);
    });
    it("applies since/until inclusively on publishedAt", async () => {
      await seedPosts();
      expect(await ids({ since: "2026-10-02T10:00:00.000Z", until: "2026-10-03T10:00:00.000Z" })).toEqual(["b1", "p2", "p3"]);
      expect(await ids({ since: "2026-10-02T10:00:00.001Z", until: "2026-10-03T09:59:59.999Z" })).toEqual([]);
      expect(await ids({ since: "2026-10-04T00:00:00.000Z" })).toEqual(["m1"]);
      expect(await ids({ until: "2026-10-01T10:00:00.000Z" })).toEqual(["p1"]);
    });
    it("searches q case-insensitively over post title, caption and design title", async () => {
      await seedPosts();
      expect(await ids({ q: "COSMIC" })).toEqual(["p1"]);
      expect(await ids({ q: "hello world" })).toEqual(["p1"]);
      expect(await ids({ q: "SPACE CAT" })).toEqual(["b1", "p1"]);
      expect(await ids({ q: "other DESIGN" })).toEqual(["m1", "p2", "p3"]);
      expect(await ids({ q: "nomatch" })).toEqual([]);
    });
    it("treats %, _ and \\ in q as literals", async () => {
      await seedPosts();
      expect(await ids({ q: "%" })).toEqual(["b1"]);
      expect(await ids({ q: "50%" })).toEqual(["b1"]);
      expect(await ids({ q: "_" })).toEqual(["b1"]);
      expect(await ids({ q: "5_" })).toEqual([]);
      expect(await ids({ q: "0%_s" })).toEqual([]);
      expect(await ids({ q: "\\" })).toEqual(["p2"]);
      expect(await ids({ q: "c:\\t" })).toEqual(["p2"]);
    });
    it("sorts by publishedAt DESC then id DESC and paginates with a stable total", async () => {
      await seedPosts();
      const all = await list();
      expect(all.total).toBe(5);
      const rows = all.data.map(item => item.post);
      const expected = [...rows].sort((a, b) => ms(b.publishedAt)! - ms(a.publishedAt)! || (a.id < b.id ? 1 : -1));
      expect(rows.map(r => r.id)).toEqual(expected.map(r => r.id));
      expect(rows[0].externalId).toBe("m1");
      expect(rows.slice(1, 3).map(r => r.externalId).sort()).toEqual(["p2", "p3"]);
      expect(rows.slice(3).map(r => r.externalId)).toEqual(["b1", "p1"]);
      const pages = [await list({ limit: "2", page: "1" }), await list({ limit: "2", page: "2" }), await list({ limit: "2", page: "3" }), await list({ limit: "2", page: "4" })];
      expect(pages.map(p => p.total)).toEqual([5, 5, 5, 5]);
      expect(pages.map(p => p.externalIds.length)).toEqual([2, 2, 1, 0]);
      expect(pages.flatMap(p => p.data.map(item => item.post.id))).toEqual(rows.map(r => r.id));
    });
    it("returns the design summary with each post", async () => {
      await seedPosts();
      const { data } = await list({ sha256: SHA_A, channel: "bluesky" });
      expect(data).toHaveLength(1);
      expect(data[0].design).toMatchObject({ id: designIds.a, title: "Space cat" });
      expect(data[0].post).toMatchObject({ externalId: "b1", status: "published" } satisfies Partial<SocialPost>);
    });
    it("summarizes counts per channel/account/status, optionally within since/until", async () => {
      expect(await summary()).toEqual([]);
      await seedPosts();
      expect(await summary()).toEqual([
        { channel: "bluesky", account: "bluesky:main", status: "published", count: 1 },
        { channel: "mastodon", account: "mastodon:alt", status: "removed", count: 1 },
        { channel: "pinterest", account: "pinterest:main", status: "published", count: 3 },
      ]);
      expect(await summary({ since: "2026-10-03T10:00:00.000Z" })).toEqual([
        { channel: "mastodon", account: "mastodon:alt", status: "removed", count: 1 },
        { channel: "pinterest", account: "pinterest:main", status: "published", count: 2 },
      ]);
      expect(await summary({ until: "2026-10-02T10:00:00.000Z" })).toEqual([
        { channel: "bluesky", account: "bluesky:main", status: "published", count: 1 },
        { channel: "pinterest", account: "pinterest:main", status: "published", count: 1 },
      ]);
    });
  });

  it("deletes posts when their design is deleted (ON DELETE CASCADE)", async () => {
    await ok(body());
    await ok(body({ externalId: "p2" }, { sha256: SHA_B }));
    await execute(`DELETE FROM designs WHERE id = '${designIds.a}'`);
    const rows = await posts();
    expect(rows).toHaveLength(1);
    expect(rows[0].externalId).toBe("p2");
  });

  if (provider === "postgres") it("forbids anon and authenticated from the table and functions; service_role can use them", async () => {
    await ok(body());
    for (const role of ["anon", "authenticated"]) {
      await expect(pgSql(`SET ROLE ${role}; SELECT * FROM design_social_posts`)).rejects.toThrow(/permission denied/i);
      await expect(pgSql(`SET ROLE ${role}; SELECT count(url) FROM design_social_posts`)).rejects.toThrow(/permission denied/i);
      await expect(pgSql(`SET ROLE ${role}; INSERT INTO design_social_posts DEFAULT VALUES`)).rejects.toThrow(/permission denied/i);
      await expect(pgSql(`SET ROLE ${role}; SELECT upsert_design_social_post('{}')`)).rejects.toThrow(/permission denied/i);
      await expect(pgSql(`SET ROLE ${role}; SELECT list_design_social_posts('{}')`)).rejects.toThrow(/permission denied/i);
      await expect(pgSql(`SET ROLE ${role}; SELECT summarize_design_social_posts('{}')`)).rejects.toThrow(/permission denied/i);
    }
    expect(await pgSql("SET ROLE service_role; SELECT count(*) FROM design_social_posts")).toBe("1");
    expect((await list()).total).toBe(1);
    expect(await summary()).toHaveLength(1);
  });
});
