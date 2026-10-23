import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import {
  createAssignment,
  digest,
  assetKey,
  canonical,
} from "@pod/og-renderer";
import { setOgImageMySQL } from "./og-image-database";
import type { OgWrite, OgWriteResult } from "@/lib/og-image";
const enabled = process.env.OG_TEST_DATABASES === "1";
const id = "a0000000-0000-4000-8000-000000000001";
const pgArgs = [
  "exec",
  "-i",
  "pinterest-plan-pg",
  "psql",
  "-X",
  "-qAt",
  "-U",
  "postgres",
  "-d",
  "pinterest_test",
  "-v",
  "ON_ERROR_STOP=1",
];
const pg = (sql: string) =>
  execFileSync("docker", pgArgs, { input: sql, encoding: "utf8" }).trim();
const run = promisify(execFile);
describe.skipIf(!enabled).each(["postgres", "mysql"] as const)(
  "Og persistence (%s, disposable compose)",
  (provider) => {
    let pool: mysql.Pool;
    const statement = async (sql: string) => {
      if (provider === "postgres") return pg(sql);
      await pool.query(sql);
      return "";
    };
    const put = async (write: OgWrite): Promise<OgWriteResult> => {
      if (provider === "mysql") return setOgImageMySQL(pool, write);
      const escaped = JSON.stringify(write).replaceAll("'", "''");
      const result = await run(
        "docker",
        [
          ...pgArgs,
          "-c",
          `SELECT public.set_design_og_image('${escaped}'::jsonb)`,
        ],
        { encoding: "utf8" },
      );
      return JSON.parse(result.stdout.trim());
    };
    beforeAll(async () => {
      if (provider === "postgres") {
        pg(
          "DO $$ BEGIN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
        );
        pg("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
        pg(readFileSync("init/postgres_tables.sql", "utf8"));
        pg(readFileSync("init/migrations/010_og_image_postgres.sql", "utf8"));
        pg(readFileSync("init/migrations/010_og_image_postgres.sql", "utf8"));
      } else {
        pool = mysql.createPool({
          host: "127.0.0.1",
          port: 35440,
          user: "root",
          password: "pinterest_test",
          database: "pinterest_test",
          multipleStatements: true,
        });
        await pool.query(
          "DROP DATABASE pinterest_test; CREATE DATABASE pinterest_test; USE pinterest_test;",
        );
        await pool.query(readFileSync("init/mysql_tables.sql", "utf8"));
        await pool.query(
          readFileSync("init/migrations/010_og_image_mysql.sql", "utf8"),
        );
        await pool.query(
          readFileSync("init/migrations/010_og_image_mysql.sql", "utf8"),
        );
      }
    }, 30000);
    beforeEach(async () => {
      await statement("DELETE FROM designs");
      await statement(
        `INSERT INTO designs (id,title,description,keywords) VALUES ('${id}','Original title','Description','')`,
      );
    });
    afterAll(async () => {
      await pool?.end();
      vi.unstubAllEnvs();
      const { closeDatabaseConnections } = await import("./database");
      await closeDatabaseConnections();
    });
    const assignment = () =>
      createAssignment({
        designId: id,
        title: "Original title",
        brand: "example.org",
        category: "Original design",
        sources: [
          {
            role: "tee",
            url: "https://ih1.redbubble.net/image.1.1234/tee.jpg",
            sha256: "a".repeat(64),
            crop: { left: 0, top: 0, width: 500, height: 700 },
          },
        ],
      });
    it("atomically accepts only one concurrent assignment and survives metadata updates", async () => {
      const a = await assignment(),
        { hash, ...body } = a;
      expect(hash).toHaveLength(64);
      const changed = {
        ...body,
        title: "Different title",
        typography: { ...a.typography, lines: ["Different title"] },
      };
      const b = { ...changed, hash: digest(canonical(changed)) };
      const results = await Promise.all([
        put({ designId: id, operation: "assign", assignment: a }),
        put({ designId: id, operation: "assign", assignment: b }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([
        "conflict",
        "created",
      ]);
      const winner = results.find((r) => r.status === "created")!.ogImage!;
      await statement("UPDATE designs SET title = 'Renamed later'");
      const repeat = await put({
        designId: id,
        operation: "assign",
        assignment: winner.assignment,
      });
      expect(repeat.status).toBe("unchanged");
      expect(repeat.ogImage).toEqual(winner);
    }, 15000);
    it("rejects another assignment's asset and never replaces a confirmed asset", async () => {
      const a = await assignment();
      await put({ designId: id, operation: "assign", assignment: a });
      const asset = {
        key: assetKey(a),
        sha256: "b".repeat(64),
        width: 1200 as const,
        height: 630 as const,
        bytes: 100,
      };
      expect(
        (
          await put({
            designId: id,
            operation: "ready",
            assignmentHash: "c".repeat(64),
            asset,
          })
        ).status,
      ).toBe("conflict");
      expect(
        (
          await put({
            designId: id,
            operation: "ready",
            assignmentHash: a.hash,
            asset,
          })
        ).status,
      ).toBe("ready");
      expect(
        (
          await put({
            designId: id,
            operation: "ready",
            assignmentHash: a.hash,
            asset,
          })
        ).status,
      ).toBe("unchanged");
      expect(
        (
          await put({
            designId: id,
            operation: "ready",
            assignmentHash: a.hash,
            asset: { ...asset, sha256: "d".repeat(64) },
          })
        ).status,
      ).toBe("conflict");
    }, 15000);
    it("does not assign inactive prints", async () => {
      const a = await assignment();
      await statement("UPDATE designs SET active = FALSE");
      expect(
        (await put({ designId: id, operation: "assign", assignment: a }))
          .status,
      ).toBe("not_found");
    });
    if (provider === "mysql")
      it("reads preparation contexts through the real facade and detects conflicting identities", async () => {
        vi.stubEnv("DATABASE_PROVIDER", "mysql");
        vi.stubEnv("MYSQL_HOST", "127.0.0.1");
        vi.stubEnv("MYSQL_PORT", "35440");
        vi.stubEnv("MYSQL_USER", "root");
        vi.stubEnv("MYSQL_PASSWORD", "pinterest_test");
        vi.stubEnv("MYSQL_DATABASE", "pinterest_test");
        const { getOgContexts } = await import("./database");
        await pool.query(
          "UPDATE designs SET externalId=1234567,sha256=?,props=? WHERE id=?",
          [
            "a".repeat(64),
            JSON.stringify({
              mockup_tshirt: "https://ih1.redbubble.net/image.123.4567/tee.png",
            }),
            id,
          ],
        );
        const first = await getOgContexts(null, 1, 50, "example.org");
        expect(first.total).toBe(1);
        expect(first.items[0].sources.tee).toContain("tee.png");
        expect(first.items[0].brand).toBe("example.org");
        expect(
          (await getOgContexts({ redbubbleId: "1234567" }, 1, 1, "example.org"))
            .items[0].designId,
        ).toBe(id);
        await expect(
          getOgContexts({ id, sha256: "b".repeat(64) }, 1, 1, "example.org"),
        ).rejects.toThrow("mismatch");
        await pool.query("UPDATE designs SET active=FALSE WHERE id=?", [id]);
        expect((await getOgContexts(null, 1, 50, "example.org")).items).toEqual(
          [],
        );
      });
  },
);
