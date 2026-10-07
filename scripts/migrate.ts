import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

type Migration = { name: string; sql: string; checksum: string };

function postgresScript(migrations: Migration[]): string {
  const statements = [
    "SET lock_timeout='10s'; SET statement_timeout='60s';",
    "SELECT pg_try_advisory_lock(732684091) AS locked \\gset",
    "\\if :locked",
    "\\else",
    "DO $$ BEGIN RAISE EXCEPTION 'Another migration runner is active'; END $$;",
    "\\endif",
    "CREATE SCHEMA IF NOT EXISTS design_studio_migrations;",
    "REVOKE ALL ON SCHEMA design_studio_migrations FROM PUBLIC, anon, authenticated;",
    "CREATE TABLE IF NOT EXISTS design_studio_migrations.history (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());",
    "REVOKE ALL ON design_studio_migrations.history FROM PUBLIC, anon, authenticated;",
  ];
  for (const { name, sql, checksum } of migrations) {
    // Existing migration 003 contains its own transaction. The runner owns the
    // transaction so schema changes and the history entry commit together.
    const body = /^\s*BEGIN\s*;/i.test(sql) && /COMMIT\s*;\s*$/i.test(sql)
      ? sql.replace(/^\s*BEGIN\s*;/i, "").replace(/COMMIT\s*;\s*$/i, "") : sql;
    statements.push(
      `SELECT EXISTS (SELECT FROM design_studio_migrations.history WHERE name = '${name}') AS applied \\gset`,
      "\\if :applied",
      `DO $$ BEGIN IF EXISTS (SELECT FROM design_studio_migrations.history WHERE name = '${name}' AND checksum <> '${checksum}') THEN RAISE EXCEPTION 'Applied migration ${name} has changed'; END IF; END $$;`,
      `\\echo Skipping ${name}`,
      "\\else",
      `\\echo Applying ${name}`,
      "BEGIN;",
      body,
      `INSERT INTO design_studio_migrations.history (name, checksum) VALUES ('${name}', '${checksum}');`,
      "COMMIT;",
      "\\endif",
    );
  }
  statements.push("NOTIFY pgrst, 'reload schema';");
  return statements.join("\n");
}

function migratePostgres(migrations: Migration[], env: NodeJS.ProcessEnv) {
  if (!env.SUPABASE_DIRECT_URL) throw new Error("SUPABASE_DIRECT_URL is required.");
  let connection: URL;
  try { connection = new URL(env.SUPABASE_DIRECT_URL); } catch {
    throw new Error("SUPABASE_DIRECT_URL must be a valid PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(connection.protocol)) {
    throw new Error("SUPABASE_DIRECT_URL must use postgres:// or postgresql://.");
  }
  const password = env.SUPABASE_DATABASE_PASS || decodeURIComponent(connection.password);
  if (!password) throw new Error("Set SUPABASE_DATABASE_PASS or a password in SUPABASE_DIRECT_URL.");
  console.log(`Migrating PostgreSQL at ${connection.hostname}:${connection.port || "5432"}.`);
  const result = spawnSync("docker", [
    "run", "--rm", "-i", "--env", "PGPASSWORD", "--env", "PGSSLMODE", "--env", "PGCONNECT_TIMEOUT=15",
    "postgres:17", "psql", "-X", "--set", "ON_ERROR_STOP=1",
    "-h", connection.hostname, "-p", connection.port || "5432",
    "-U", decodeURIComponent(connection.username), "-d", connection.pathname.slice(1) || "postgres",
  ], {
    input: postgresScript(migrations), encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password, PGSSLMODE: connection.searchParams.get("sslmode") || "require" },
    timeout: (migrations.length + 1) * 90_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("PostgreSQL migrations failed; later migrations were not run.");
}

async function migrateMySQL(migrations: Migration[], env: NodeJS.ProcessEnv) {
  if (!env.MYSQL_HOST || !env.MYSQL_USER || !env.MYSQL_PASSWORD || !env.MYSQL_DATABASE) {
    throw new Error("MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE are required.");
  }
  const connection = await mysql.createConnection({
    host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT || 3306), user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE, multipleStatements: true,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
  });
  try {
    const [locks] = await connection.query<mysql.RowDataPacket[]>("SELECT GET_LOCK('design-studio:migrate', 0) AS locked");
    if (locks[0].locked !== 1) throw new Error("Another migration runner is active.");
    await connection.query("CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    const [history] = await connection.query<mysql.RowDataPacket[]>("SELECT name, checksum FROM schema_migrations");
    for (const { name, sql, checksum } of migrations) {
      const applied = history.find(row => row.name === name);
      if (applied) {
        if (applied.checksum !== checksum) throw new Error(`Applied migration ${name} has changed.`);
        console.log(`Skipping ${name}`);
        continue;
      }
      console.log(`Applying ${name}`);
      // MySQL DDL commits implicitly. Record success only after the whole file;
      // migrations must be rerunnable in case a previous attempt stopped midway.
      await connection.query(sql);
      await connection.execute("INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)", [name, checksum]);
    }
  } finally {
    await connection.end(); // Closing the session also releases GET_LOCK.
  }
}

export async function migrate(directory = resolve("init/migrations"), env: NodeJS.ProcessEnv = process.env) {
  const provider = env.DATABASE_PROVIDER || "supabase";
  if (provider !== "supabase" && provider !== "mysql") throw new Error(`Unsupported DATABASE_PROVIDER: ${provider}`);
  const suffix = provider === "supabase" ? "postgres" : "mysql";
  const migrations = readdirSync(directory)
    .filter(name => new RegExp(`^\\d+_[a-z0-9_]+_${suffix}\\.sql$`).test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map(name => {
      const sql = readFileSync(resolve(directory, name), "utf8").replace(/\r\n/g, "\n");
      return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    });
  if (provider === "supabase") migratePostgres(migrations, env);
  else await migrateMySQL(migrations, env);
  console.log("Database migrations are up to date.");
}

if (require.main === module) {
  config();
  migrate().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
