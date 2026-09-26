import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { closeDatabaseConnections, getMySQLPool } from "../utils/database";
import { planSlugBackfill } from "../lib/slug";

type Row = { id: string; externalId: number; title: string; slug: string | null };

const PAGE_SIZE = 1000;

async function fetchAllRowsSupabase(): Promise<Row[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to backfill slugs.",
    );
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const rows: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("designs")
      .select("id, externalId, title, slug")
      .order("createdAt")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Failed to page designs from Supabase: ${error.message}`);
    }
    const page = (data as Row[] | null) || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function applyPlanSupabase(
  plan: { id: string; slug: string }[],
  dryRun: boolean,
): Promise<{ updated: number; errors: number }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  let updated = 0;
  let errors = 0;
  for (const { id, slug } of plan) {
    if (dryRun) {
      console.log(`${id} -> ${slug}`);
      continue;
    }
    const { error } = await supabase.from("designs").update({ slug }).eq("id", id).is("slug", null);
    if (error) {
      errors += 1;
      console.error(`Failed to set slug for ${id}: ${error.message}`);
    } else {
      updated += 1;
    }
  }
  return { updated, errors };
}

async function fetchAllRowsMySQL(): Promise<Row[]> {
  const pool = getMySQLPool();
  const [rows] = await pool.query("SELECT id, externalId, title, slug FROM designs ORDER BY createdAt, id");
  return rows as Row[];
}

async function applyPlanMySQL(
  plan: { id: string; slug: string }[],
  dryRun: boolean,
): Promise<{ updated: number; errors: number }> {
  const pool = getMySQLPool();
  let updated = 0;
  let errors = 0;
  for (const { id, slug } of plan) {
    if (dryRun) {
      console.log(`${id} -> ${slug}`);
      continue;
    }
    try {
      await pool.query("UPDATE designs SET slug = ? WHERE id = ? AND slug IS NULL", [slug, id]);
      updated += 1;
    } catch (error) {
      errors += 1;
      console.error(`Failed to set slug for ${id}: ${error}`);
    }
  }
  return { updated, errors };
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  const provider = process.env.DATABASE_PROVIDER || "supabase";

  const rows = provider === "mysql" ? await fetchAllRowsMySQL() : await fetchAllRowsSupabase();
  const plan = planSlugBackfill(rows);

  console.log(`planned: ${plan.length}`);

  const { updated, errors } =
    provider === "mysql" ? await applyPlanMySQL(plan, dryRun) : await applyPlanSupabase(plan, dryRun);

  console.log(JSON.stringify({ planned: plan.length, updated: dryRun ? 0 : updated, errors }, null, 2));

  if (errors > 0) process.exitCode = 1;
}

async function main() {
  try {
    await run();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnections();
  }
}

main();
