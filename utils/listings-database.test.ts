import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { IngestInput, IngestResult, parseIngestInput } from "@/lib/listings";
import { designSlugBase } from "@/lib/slug";
import { ingestListingMySQL } from "@/utils/listings-database";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
const exec = promisify(execFile);
const pgContainer = "design-studio-listings-postgres";
const runDbTests = process.env.LISTINGS_TEST_DATABASES === "1";

function input(overrides: Partial<IngestInput> = {}): IngestInput {
  return parseIngestInput({
    design: { sourceImageId: 299, sha256: "a".repeat(64), title: "Space cat", tags: ["space", "cat"], backgroundColor: "#000000" },
    listing: { platform: "redbubble", account: "redbubble:main", externalId: "184507566", url: "https://www.redbubble.com/shop/ap/184507566" },
    ...overrides,
  });
}
function sqlString(value: string): string { return `'${value.replace(/'/g, "''")}'`; }
async function pgSql(sql: string): Promise<string> {
  const { stdout } = await exec("docker", ["exec", pgContainer, "psql", "-X", "-qAt", "-U", "postgres", "-d", "listings_test", "-v", "ON_ERROR_STOP=1", "-c", sql]);
  return stdout.trim();
}

// Explicit opt-in, fixed disposable local targets, and no .env loading. These tests
// must never use the deployment's Supabase URL or MYSQL_* settings.
describe.skipIf(!runDbTests).each(["postgres", "mysql"] as const)("listings transaction (%s)", provider => {
  let pool: mysql.Pool;
  const query = async (sql: string): Promise<Record<string, unknown>[]> => {
    if (provider === "postgres") {
      const result = await pgSql(`SELECT coalesce(json_agg(t), '[]'::json) FROM (${sql}) t`);
      return JSON.parse(result);
    }
    const [rows] = await pool.query<mysql.RowDataPacket[]>(sql);
    return rows;
  };
  const execute = async (sql: string) => {
    if (provider === "postgres") await pgSql(sql); else await pool.query(sql);
  };
  const ingest = async (body: IngestInput): Promise<IngestResult> => {
    if (provider === "mysql") return ingestListingMySQL(pool, body);
    return JSON.parse(await pgSql(`SET ROLE service_role; SELECT public.ingest_design_listing(${sqlString(JSON.stringify(body))}::jsonb, ${sqlString(designSlugBase(body.design.title, body.design.sourceImageId))})`));
  };
  const designs = () => query("SELECT * FROM designs");
  const listings = () => query("SELECT * FROM design_listings");
  beforeAll(async () => {
    if (provider === "postgres") {
      await pgSql("DO $$ BEGIN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;");
      // Upgrade a pre-ingest install, then rerun the idempotent PG migration.
      const schema = readFileSync("init/postgres_tables.sql", "utf8").split("CREATE TABLE IF NOT EXISTS public.design_listings")[0]
        .replace('"externalId" bigint null,', '"externalId" bigint not null,')
        .replace(/^.*(?:"sourceImageId" bigint|sha256 text|source text).*\r?\n/gm, "");
      await pgSql(schema);
      await pgSql(readFileSync("init/migrations/003_design_listings_postgres.sql", "utf8"));
      await pgSql(readFileSync("init/migrations/003_design_listings_postgres.sql", "utf8"));
      await pgSql("GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;");
    } else {
      pool = mysql.createPool({ host: "127.0.0.1", port: 33316, user: "root", password: "listings-test", database: "listings_test", dateStrings: true, multipleStatements: true });
      await pool.query("DROP TABLE IF EXISTS design_listings, design_collections, collections, designs, studio");
      const schema = readFileSync("init/mysql_tables.sql", "utf8").split("CREATE TABLE design_listings")[0]
        .replace('`externalId` BIGINT NULL,', '`externalId` BIGINT NOT NULL,')
        .replace('title VARCHAR(500) NOT NULL,', 'title VARCHAR(255) NOT NULL,')
        .replace(/^.*(?:`sourceImageId` BIGINT|sha256 VARCHAR|source TEXT).*\r?\n/gm, "");
      await pool.query(schema);
      await pool.query(readFileSync("init/migrations/003_design_listings_mysql.sql", "utf8"));
    }
  }, 30000);
  beforeEach(async () => { await execute("DELETE FROM designs"); });
  afterAll(async () => { if (pool) await pool.end(); });

  it("creates a design and listing and mirrors canonical Redbubble fields", async () => {
    const result = await ingest(input());
    expect(result.created).toEqual({ design: true, listing: true });
    expect(result.design).toMatchObject({ title: "Space cat", externalId: 184507566, sha256: "a".repeat(64), sourceImageId: 299 });
    const [saved] = await designs();
    expect(saved).toMatchObject({ source: "pod-studio", keywords: "space,cat", backgroundColor: "#000000", externalLink: input().listing.url });
    expect(await listings()).toHaveLength(1);
  });
  it("repeat updates only supplied listing fields; preserves publish time and curated design", async () => {
    const body = input();
    body.listing.tags = ["original"];
    body.listing.title = "Listing title";
    body.listing.publishedAt = "2026-10-07T08:10:00.000Z";
    body.listing.extra = { backgroundColor: "#fff" };
    const first = await ingest(body);
    const repeated = input();
    repeated.design.title = "Changed title";
    repeated.design.tags = ["changed"];
    repeated.listing.description = "New listing description";
    const second = await ingest(repeated);
    expect(second.created).toEqual({ design: false, listing: false });
    expect(second.design).toEqual(first.design);
    expect(second.listing).toMatchObject({ id: first.listing.id, tags: ["original"], title: "Listing title", extra: { backgroundColor: "#fff" } });
    expect(new Date(second.listing.publishedAt!).toISOString()).toBe("2026-10-07T08:10:00.000Z");
    expect((await listings())[0].description).toBe("New listing description");
    expect((await designs())[0].keywords).toBe("space,cat");
  });
  it("adds a second platform to the same design by hash", async () => {
    const first = await ingest(input());
    const next = input();
    next.listing = { platform: "teepublic", account: "teepublic:main", externalId: "99914330", url: "https://www.teepublic.com/t-shirt/99914330-space-cat" };
    next.design.title = "Different platform title";
    const second = await ingest(next);
    expect(second.design.id).toBe(first.design.id);
    expect(second.created).toEqual({ design: false, listing: true });
    expect(await designs()).toHaveLength(1);
    expect(await listings()).toHaveLength(2);
    expect((await designs())[0].props).toMatchObject({ teepublicLink: next.listing.url, teepublicId: "99914330" });
  });
  it("supports multiple Redbubble accounts without rewriting the first legacy work ID", async () => {
    const first = await ingest(input());
    const next = input(); next.listing.account = "redbubble:second"; next.listing.externalId = "184507567"; next.listing.url = "https://www.redbubble.com/shop/ap/184507567";
    const second = await ingest(next);
    expect(second.design.id).toBe(first.design.id);
    expect(second.design.externalId).toBe(184507566);
    expect(second.created.listing).toBe(true);
    expect(await listings()).toHaveLength(2);
    expect((await designs())[0].externalLink).toBe(next.listing.url);
  });
  it.each(["redbubble", "teepublic"] as const)("adopts a scraper-created %s row and preserves curated fields", async platform => {
    const props = platform === "teepublic" ? '{"teepublicId":"99914330","custom":"curated"}' : '{"custom":"curated"}';
    await execute(`INSERT INTO designs (${provider === "postgres" ? '"externalId"' : 'externalId'}, title, description, keywords, props) VALUES (184507566, 'Curated title', 'Curated description', 'curated tags', ${sqlString(props)})`);
    const body = input();
    if (platform === "teepublic") body.listing = { platform, account: "teepublic:main", externalId: "99914330", url: "https://www.teepublic.com/t-shirt/99914330-space-cat" };
    else body.listing.extra = { mockupTshirt: "https://ih1.redbubble.net/image.1.7566/ssrco,classic_tee,flatlay,fafafa:ca443f4786,front.jpg" };
    const result = await ingest(body);
    expect(result.created).toEqual({ design: false, listing: true });
    expect(result.design.title).toBe("Curated title");
    const [saved] = await designs();
    expect(saved).toMatchObject({ description: "Curated description", keywords: "curated tags", source: "pod-studio", sha256: "a".repeat(64), sourceImageId: 299, props: { custom: "curated" } });
    if (platform === "redbubble") expect(saved.props).toMatchObject({ mockup_tshirt: body.listing.extra!.mockupTshirt });
  });
  it("rejects a title clash and rolls back all writes", async () => {
    await ingest(input());
    const next = input();
    next.design.sourceImageId = 300; next.design.sha256 = "b".repeat(64);
    next.listing.externalId = "184507567";
    await expect(ingest(next)).rejects.toThrow(/conflict/i);
    expect(await designs()).toHaveLength(1);
    expect(await listings()).toHaveLength(1);
  });
  it("rejects a listing external ID owned by another design and rolls back creation", async () => {
    const first = input();
    first.listing = { platform: "spreadshirt", account: "spreadshirt:main", externalId: "abc", url: "https://spreadshirt.com/abc" };
    await ingest(first);
    const next = input(); next.design = { sourceImageId: 300, sha256: "b".repeat(64), title: "Other design" }; next.listing = first.listing;
    await expect(ingest(next)).rejects.toThrow(/another design/i);
    expect(await designs()).toHaveLength(1);
  });
  it("rejects inconsistent hash and sourceImageId with both design IDs", async () => {
    const first = await ingest(input());
    const next = input(); next.design = { sourceImageId: 300, sha256: "b".repeat(64), title: "Other design" }; next.listing = { platform: "spreadshirt", account: "spreadshirt:main", externalId: "abc", url: "https://spreadshirt.com/abc" };
    const second = await ingest(next);
    next.design.sha256 = first.design.sha256!;
    await expect(ingest(next)).rejects.toThrow(/different designs/i);
    expect(await listings()).toHaveLength(2);
    expect(second.design.id).not.toBe(first.design.id);
  });
  it("rejects a second listing for the same platform/account", async () => {
    const body = input(); body.listing = { platform: "teepublic", account: "teepublic:main", externalId: "123", url: "https://teepublic.com/t-shirt/123-cat" };
    await ingest(body); body.listing.externalId = "124";
    await expect(ingest(body)).rejects.toThrow(/Account already/i);
    expect(await listings()).toHaveLength(1);
    expect((await designs())[0].props).toMatchObject({ teepublicId: "123" });
  });
  it("keeps a non-Redbubble design visible in the normalized public DTO", async () => {
    const body = input(); body.listing = { platform: "teepublic", account: "teepublic:main", externalId: "123", url: "https://teepublic.com/t-shirt/123-cat" };
    const result = await ingest(body);
    expect(result.design.externalId).toBeNull();
    expect((await designs())[0].externalLink).toBeNull();
    const { mapRowToDesign } = await import("@/utils/database");
    const { toPublicPrint } = await import("@/lib/public-api");
    const design = mapRowToDesign((await designs())[0] as mysql.RowDataPacket);
    expect(toPublicPrint(design)).toMatchObject({ id: result.design.id, title: "Space cat", link: "", imageUrl: "", teepublicLink: body.listing.url });
  });
  it("allocates unique stable slugs including non-ASCII titles", async () => {
    const first = input(); first.design.title = "Cat!"; await ingest(first);
    const next = input(); next.design = { sourceImageId: 300, sha256: "b".repeat(64), title: "Cat" }; next.listing = { platform: "spreadshirt", account: "spreadshirt:main", externalId: "abc", url: "https://spreadshirt.com/abc" };
    expect((await ingest(next)).design.slug).toBe("cat-2");
    next.design = { sourceImageId: 301, sha256: "c".repeat(64), title: "猫" }; next.listing.externalId = "def";
    expect((await ingest(next)).design.slug).toBe("design-301");
  });
  it("supports the 500-character title limit", async () => {
    const body = input(); body.design.title = "a".repeat(500);
    expect((await ingest(body)).design.title).toHaveLength(500);
  });
  if (provider === "postgres") it("restricts anon to safe link columns and forbids the write RPC", async () => {
    await expect(pgSql("SET ROLE anon; SELECT * FROM design_listings")).rejects.toThrow(/permission denied/i);
    await expect(pgSql("SET ROLE anon; SELECT ingest_design_listing('{}', 'x')")).rejects.toThrow(/permission denied/i);
    await expect(pgSql("SET ROLE authenticated; SELECT ingest_design_listing('{}', 'x')")).rejects.toThrow(/permission denied/i);
    expect(await pgSql("SET ROLE anon; SELECT count(url) FROM design_listings")).toBe("0");
    await expect(pgSql("SET ROLE anon; INSERT INTO design_listings DEFAULT VALUES")).rejects.toThrow(/permission denied/i);
  });
});
