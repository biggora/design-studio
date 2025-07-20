import { createClient } from "@supabase/supabase-js";
import mysql from "mysql2/promise";
import { SiteConfig } from "@/lib/store";
import { mapDataToConfig } from "@/lib/config";
import { ConfigProp } from "@/types/config";
import { Design } from "@/types/design";

const provider = process.env.DATABASE_PROVIDER || "supabase";

let supabase: ReturnType<typeof createClient> | null = null;
let pool: mysql.Pool | null = null;

if (provider === "supabase") {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else if (provider === "mysql") {
  const { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env;

  if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_PASSWORD || !MYSQL_DATABASE) {
    throw new Error("Missing MySQL environment variables");
  }

  pool = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT ? Number(MYSQL_PORT) : 3306,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
  });
} else {
  throw new Error(`Unsupported DATABASE_PROVIDER: ${provider}`);
}

export async function getSiteConfig(): Promise<SiteConfig> {
  if (provider === "supabase") {
    const { data } = await supabase!.from("studio").select("*");
    return mapDataToConfig(data as ConfigProp[]);
  }

  const [rows] = await pool!.query<ConfigProp[]>("SELECT * FROM studio");
  return mapDataToConfig(rows);
}

export async function fetchDesigns(
  page: number,
  searchQuery: string,
  collection: string,
  itemsPerPage = 12,
): Promise<{ designs: Design[]; total: number }> {
  if (provider === "supabase") {
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage - 1;

    let query = supabase!.from("designs").select("*", { count: "exact" });
    if (searchQuery) {
      query = query.ilike("title", `%${searchQuery}%`);
    }
    if (collection) {
      query = query.eq("collection", collection);
    }

    const { data, error, count } = await query.range(start, end);
    if (error) {
      console.error("Error fetching designs:", error);
      return { designs: [], total: 0 };
    }

    return { designs: data || [], total: count || 0 };
  }

  const offset = (page - 1) * itemsPerPage;
  let base = "FROM designs WHERE 1";
  const params: any[] = [];

  if (searchQuery) {
    base += " AND title LIKE ?";
    params.push(`%${searchQuery}%`);
  }
  if (collection) {
    base += " AND collection = ?";
    params.push(collection);
  }

  const [rows] = await pool!.query<Design[]>(
    `SELECT * ${base} LIMIT ? OFFSET ?`,
    [...params, itemsPerPage, offset],
  );
  const [countRows] = await pool!.query<{ total: number }[]>(
    `SELECT COUNT(*) as total ${base}`,
    params,
  );

  const total = countRows[0]?.total ?? 0;
  return { designs: rows, total };
}

export async function getDesignById(
  id: string,
): Promise<{ design: Design; relatedDesigns: Design[] } | null> {
  if (provider === "supabase") {
    const { data: design, error } = await supabase!
      .from("designs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !design) {
      console.error("Error fetching design:", error);
      return null;
    }

    const { data: relatedDesigns, error: relatedError } = await supabase!
      .from("designs")
      .select("*")
      .eq("collection", design.collection)
      .neq("id", id)
      .limit(3);

    if (relatedError) {
      console.error("Error fetching related designs:", relatedError);
    }

    return { design, relatedDesigns: relatedDesigns || [] };
  }

  const [rows] = await pool!.query<Design[]>(
    "SELECT * FROM designs WHERE id = ?",
    [id],
  );
  const design = rows[0];
  if (!design) {
    return null;
  }

  const [relatedRows] = await pool!.query<Design[]>(
    "SELECT * FROM designs WHERE collection = ? AND id <> ? LIMIT 3",
    [design.collection, id],
  );

  return { design, relatedDesigns: relatedRows };
}

export async function fetchCollections(): Promise<string[]> {
  if (provider === "supabase") {
    const { data, error } = await supabase!
      .from("designs")
      .select("collection")
      .not("collection", "is", null);

    if (error) {
      console.error("Error fetching collections:", error);
      return [];
    }

    const set = new Set<string>(data.map((item) => item.collection));
    return Array.from(set);
  }

  const [rows] = await pool!.query<{ collection: string }[]>(
    "SELECT DISTINCT collection FROM designs WHERE collection IS NOT NULL",
  );
  return rows.map((row) => row.collection);
}
