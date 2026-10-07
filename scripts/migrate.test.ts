import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import mysql from "mysql2/promise";
import { migrate } from "./migrate";

const enabled = process.env.MIGRATIONS_TEST_DATABASES === "1";
const pgContainer = "design-studio-migrations-postgres";
const pgEnv = {
  NODE_ENV: "test" as const,
  DATABASE_PROVIDER: "supabase",
  SUPABASE_DIRECT_URL: "postgres://postgres:migrations-test@host.docker.internal:33318/migrations_test?sslmode=disable",
};
const mysqlEnv = {
  NODE_ENV: "test" as const,
  DATABASE_PROVIDER: "mysql", MYSQL_HOST: "127.0.0.1", MYSQL_PORT: "33317",
  MYSQL_USER: "root", MYSQL_PASSWORD: "migrations-test", MYSQL_DATABASE: "migrations_test",
};

// Fixed disposable targets, explicit opt-in, and no dotenv loading. Production
// connection settings are never used, even when a local .env exists.
describe.skipIf(!enabled).each(["postgres", "mysql"] as const)("migration runner (%s)", provider => {
  let pool: mysql.Pool;
  let directory: string;
  const env = provider === "postgres" ? pgEnv : mysqlEnv;
  const sql = async (statement: string): Promise<string> => {
    if (provider === "postgres") return execFileSync("docker", [
      "exec", "-i", pgContainer, "psql", "-X", "-qAt", "-U", "postgres", "-d", "migrations_test", "-v", "ON_ERROR_STOP=1",
    ], { input: statement, encoding: "utf8" }).trim();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(statement);
    return JSON.stringify(rows);
  };
  const history = async (): Promise<string[]> => {
    if (provider === "postgres") {
      return JSON.parse(await sql("SELECT coalesce(json_agg(name ORDER BY name),'[]') FROM design_studio_migrations.history"));
    }
    return JSON.parse(await sql("SELECT name FROM schema_migrations ORDER BY name")).map((row: {name: string}) => row.name);
  };
  beforeAll(async () => {
    if (provider === "mysql") pool = mysql.createPool({
      host: mysqlEnv.MYSQL_HOST, port: Number(mysqlEnv.MYSQL_PORT), user: mysqlEnv.MYSQL_USER,
      password: mysqlEnv.MYSQL_PASSWORD, database: mysqlEnv.MYSQL_DATABASE, multipleStatements: true,
    });
    else await sql("DO $$ BEGIN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
  });
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "design-studio-migrations-"));
    for (const name of readdirSync("init/migrations")) copyFileSync(resolve("init/migrations", name), join(directory, name));
    if (provider === "postgres") {
      await sql(`DROP SCHEMA IF EXISTS design_studio_migrations CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;
        CREATE TABLE designs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "externalId" BIGINT NOT NULL UNIQUE,
        title VARCHAR NOT NULL UNIQUE, description TEXT, keywords TEXT, "backgroundColor" TEXT NOT NULL DEFAULT '#FFFFFF',
        props JSON, "externalLink" TEXT, "updatedAt" TIMESTAMP);`);
    } else {
      await sql(`DROP TABLE IF EXISTS schema_migrations, design_listings, design_collections, collections, designs, probe;
        CREATE TABLE designs (id CHAR(36) PRIMARY KEY DEFAULT (UUID()), externalId BIGINT NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL UNIQUE);`);
    }
  });
  afterAll(async () => { if (pool) await pool.end(); });
  afterEach(() => {
    if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith("design-studio-migrations-")) {
      throw new Error("Unexpected migration fixture directory");
    }
    rmSync(directory, { recursive: true });
  });

  it("applies all files in order, skips repeats, and discovers a later pending file", async () => {
    const output = vi.spyOn(console, "log");
    try {
      await migrate(directory, env);
      expect((await history()).map(name => name.slice(0, 3))).toEqual(["001", "002", "003"]);
      await sql("ALTER TABLE designs RENAME COLUMN slug TO slug_saved");
      // If any old SQL file ran again it would recreate slug.
      await migrate(directory, env);
      const column = provider === "postgres"
        ? await sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='designs' AND column_name='slug'")
        : JSON.parse(await sql("SELECT count(*) AS n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='designs' AND column_name='slug'"))[0].n;
      expect(Number(column)).toBe(0);
      writeFileSync(join(directory, `004_probe_${provider}.sql`), "CREATE TABLE probe (id INTEGER PRIMARY KEY);");
      await migrate(directory, env);
      expect(await history()).toHaveLength(4);
      await sql("INSERT INTO probe (id) VALUES (1)");
    } finally { output.mockRestore(); }
  }, 60000);

  it("initializes history on a schema already migrated manually", async () => {
    await migrate(directory, env);
    await sql(provider === "postgres" ? "DROP SCHEMA design_studio_migrations CASCADE" : "DROP TABLE schema_migrations");
    await migrate(directory, env);
    expect(await history()).toHaveLength(3);
  }, 60000);

  it("stops at a failed file, leaves it unrecorded, and does not run later files", async () => {
    writeFileSync(join(directory, `004_failed_${provider}.sql`), "CREATE TABLE probe (id INTEGER); SELECT * FROM missing_migration_table;");
    writeFileSync(join(directory, `005_later_${provider}.sql`), "CREATE TABLE later_probe (id INTEGER);");
    await expect(migrate(directory, env)).rejects.toThrow();
    expect(await history()).toHaveLength(3);
    const count = provider === "postgres"
      ? await sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('probe','later_probe')")
      : JSON.parse(await sql("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='later_probe'"))[0].n;
    expect(Number(count)).toBe(0);
  }, 60000);

  it("rejects changes to an applied migration", async () => {
    await migrate(directory, env);
    writeFileSync(join(directory, `001_collections_${provider}.sql`), "SELECT 1;");
    await expect(migrate(directory, env)).rejects.toThrow();
    expect(await history()).toHaveLength(3);
  }, 60000);

  it("refuses to run while another session holds the migration lock", async () => {
    if (provider === "mysql") {
      const holder = await pool.getConnection();
      try {
        await holder.query("SELECT GET_LOCK('design-studio:migrate', 0)");
        await expect(migrate(directory, env)).rejects.toThrow("Another migration runner");
      } finally {
        await holder.query("SELECT RELEASE_LOCK('design-studio:migrate')");
        holder.release();
      }
      return;
    }
    const holder = spawn("docker", ["exec", "-i", pgContainer, "psql", "-X", "-qAt", "-U", "postgres", "-d", "migrations_test"]);
    const exited = new Promise<void>((resolve, reject) => {
      holder.on("error", reject);
      holder.on("exit", code => code === 0 ? resolve() : reject(new Error("Lock holder failed")));
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Lock holder timed out")), 10000);
        holder.stdout.on("data", data => {
          if (data.toString().includes("LOCK_HELD")) { clearTimeout(timer); resolve(); }
        });
        holder.stdin.write("SELECT pg_advisory_lock(732684091);\n\\echo LOCK_HELD\n");
      });
      await expect(migrate(directory, env)).rejects.toThrow("PostgreSQL migrations failed");
    } finally {
      holder.stdin.end();
      await exited;
    }
  }, 30000);
});
