import {cache} from "react";
import {unstable_cache} from "next/cache";
import {createClient} from "@supabase/supabase-js";
import mysql from "mysql2/promise";
import {SiteConfig} from "@/lib/store";
import {mapDataToConfig} from "@/lib/config";
import {ConfigProp} from "@/types/config";
import {Design} from "@/types/design";

const globalForMySQL = globalThis as unknown as { mysqlPool?: mysql.Pool };

let supabase: ReturnType<typeof createClient> | null = null;
let lastGoodSiteConfig: SiteConfig | null = null;

export function getSupabase(): ReturnType<typeof createClient> {
    if (!supabase) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey =
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error("Missing Supabase environment variables");
        }

        supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
    return supabase;
}

export function getMySQLPool(): mysql.Pool {
    if (!globalForMySQL.mysqlPool) {
        const {MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE} = process.env;

        if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_PASSWORD || !MYSQL_DATABASE) {
            throw new Error("Missing MySQL environment variables");
        }

        globalForMySQL.mysqlPool = mysql.createPool({
            host: MYSQL_HOST,
            port: MYSQL_PORT ? Number(MYSQL_PORT) : 3306,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: MYSQL_DATABASE,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            dateStrings: true,
            ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
        });
    }
    return globalForMySQL.mysqlPool;
}

export async function closeDatabaseConnections(): Promise<void> {
    const globalForMySQL = globalThis as unknown as { mysqlPool?: mysql.Pool };
    if (globalForMySQL.mysqlPool) {
        await globalForMySQL.mysqlPool.end();
        globalForMySQL.mysqlPool = undefined;
    }
}

function getProvider(): string {
    const provider = process.env.DATABASE_PROVIDER || "supabase";
    if (provider !== "supabase" && provider !== "mysql") {
        throw new Error(`Unsupported DATABASE_PROVIDER: ${provider}`);
    }
    return provider;
}

// The sync pipeline stores "no_collection" when a design has no collection;
// that sentinel is for query bookkeeping and must never reach the UI, which
// treats an empty collection as "no collection".
const NO_COLLECTION_SENTINEL = "no_collection";

function normalizeCollection(value: unknown): string {
    const collection = typeof value === "string" ? value.trim() : "";
    return collection && collection !== NO_COLLECTION_SENTINEL ? collection : "";
}

export function mapRowToDesign(row: mysql.RowDataPacket): Design {
    return {
        id: row.id as string,
        externalId: row.externalId as number,
        title: row.title as string,
        externalLink: row.externalLink as string,
        externalImageUrl: row.externalImageUrl as string,
        category: row.category as string,
        collection: normalizeCollection(row.collection),
        imageName: row.imageName as string,
        description: row.description as string,
        keywords: row.keywords as string,
        backgroundColors: row.backgroundColors as string,
        backgroundColor: row.backgroundColor as string,
        createdAt:
            row.createdAt instanceof Date
                ? row.createdAt.toISOString()
                : String(row.createdAt || new Date().toISOString()),
        updatedAt: (row.updatedAt instanceof Date
            ? row.updatedAt.toISOString()
            : (row.updatedAt ? String(row.updatedAt) : undefined)) as string,
        dimensions: row.dimensions as string | undefined,
        material: row.material as string | undefined,
        price: row.price as number | undefined,
        inStock: row.inStock as boolean | undefined,
        shared: Boolean(row.shared),
        props: row.props as object | undefined,
    };
}

function handleSiteConfigFailure(err: unknown): SiteConfig {
    console.error("Error fetching site config:", err);
    // last-known-good config keeps the real brand live during transient DB outages
    if (lastGoodSiteConfig) {
        return lastGoodSiteConfig;
    }
    throw new Error("Failed to load site config", {cause: err});
}

export async function loadSiteConfig(): Promise<SiteConfig> {
    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const {data, error} = await supabaseClient.from("studio").select("*").returns<ConfigProp[]>();
        if (error) {
            return handleSiteConfigFailure(error);
        }
        const config = mapDataToConfig(data || []);
        lastGoodSiteConfig = config;
        return config;
    }

    try {
        const pool = getMySQLPool();
        const [rows] = await pool.query<mysql.RowDataPacket[] & ConfigProp[]>("SELECT * FROM studio");
        const config = mapDataToConfig(rows);
        lastGoodSiteConfig = config;
        return config;
    } catch (err) {
        return handleSiteConfigFailure(err);
    }
}

export const SITE_CONFIG_TAG = "site-config";

// Per-render dedupe (React cache) around a cross-request cache (unstable_cache),
// invalidated by /api/revalidate/config; the 5-min revalidate is a safety TTL.
export const getSiteConfig = cache(unstable_cache(loadSiteConfig, ["site-config"], {
    tags: [SITE_CONFIG_TAG],
    revalidate: 300,
}));

export async function fetchDesigns(
    page: number,
    searchQuery: string,
    collection: string,
    itemsPerPage = 12,
    keywords: string[] = [],
): Promise<{ designs: Design[]; total: number }> {
    const safePage = Math.max(1, Number.isInteger(page) ? page : 1);
    const safeLimit = Math.max(1, Math.min(100, Number.isInteger(itemsPerPage) ? itemsPerPage : 12));
    const offset = (safePage - 1) * safeLimit;

    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const start = offset;
        const end = offset + safeLimit - 1;

        const runLegacyQuery = async (from = start, to = end) => {
            let query = supabaseClient.from("designs").select("*", {count: "exact"});
            if (searchQuery) {
                query = query.ilike("title", `%${searchQuery}%`);
            }
            if (collection) {
                query = query.eq("collection", collection);
            }
            if (keywords.length) {
                query = query.or(keywords.map(k => `keywords.ilike.%${k}%`).join(","));
            }
            query = query.order("createdAt", { ascending: false }).order("id", { ascending: false });
            return query.range(from, to);
        };

        const runJoinQuery = async (from = start, to = end) => {
            let query = supabaseClient
                .from("designs")
                .select("*, design_collections!inner(collections!inner(title))", {count: "exact"});
            if (searchQuery) {
                query = query.ilike("title", `%${searchQuery}%`);
            }
            query = query.eq("design_collections.collections.title", collection);
            if (keywords.length) {
                query = query.or(keywords.map(k => `keywords.ilike.%${k}%`).join(","));
            }
            query = query.order("createdAt", { ascending: false }).order("id", { ascending: false });
            return query.range(from, to);
        };

        const runInitial = collection ? runJoinQuery : runLegacyQuery;
        let {data, error, count} = await runInitial();

        // Out-of-range page: re-run the same query kind with range(0, 0) to get
        // the real count, without treating it as a join-vs-legacy fallback signal.
        if (error?.code === "PGRST103") {
            ({count} = await runInitial(0, 0));
            return {designs: [], total: count || 0};
        }

        // Fall back to the legacy single-collection filter if the join errors
        // (tables not migrated yet) or matches nothing.
        if (collection && (error || !count)) {
            ({data, error, count} = await runLegacyQuery());

            if (error?.code === "PGRST103") {
                ({count} = await runLegacyQuery(0, 0));
                return {designs: [], total: count || 0};
            }
        }

        if (error) {
            console.error("Error fetching designs:", error);
            return {designs: [], total: 0};
        }

        // Convert data to Design[] using appropriate type checking
        const designs: Design[] = (data || []).map(item => ({
            id: item.id as string,
            externalId: item.externalId as number,
            title: item.title as string,
            externalLink: item.externalLink as string,
            externalImageUrl: item.externalImageUrl as string,
            category: item.category as string,
            collection: normalizeCollection(item.collection),
            imageName: item.imageName as string,
            description: item.description as string,
            keywords: item.keywords as string,
            backgroundColors: item.backgroundColors as string,
            backgroundColor: item.backgroundColor as string,
            createdAt: item.createdAt as string,
            updatedAt: item.updatedAt as string,
            dimensions: item.dimensions as string | undefined,
            material: item.material as string | undefined,
            price: item.price as number | undefined,
            inStock: item.inStock as boolean | undefined,
            shared: item.shared as boolean | undefined,
            props: item.props as object | undefined,
        }));

        return {designs, total: count || 0};
    }

    const pool = getMySQLPool();

    const buildBase = (withCollectionJoin: boolean) => {
        let base = "FROM designs WHERE 1";
        const params: (string | number)[] = [];

        if (searchQuery) {
            base += " AND title LIKE ?";
            params.push(`%${searchQuery}%`);
        }
        if (collection) {
            base += withCollectionJoin
                ? " AND (collection = ? OR EXISTS (SELECT 1 FROM design_collections dc JOIN collections c ON c.id = dc.collectionId WHERE dc.designId = designs.id AND c.title = ?))"
                : " AND collection = ?";
            params.push(collection);
            if (withCollectionJoin) {
                params.push(collection);
            }
        }
        if (keywords.length) {
            base += ` AND (${keywords.map(() => "LOWER(keywords) LIKE ?").join(" OR ")})`;
            keywords.forEach(k => params.push(`%${k}%`));
        }

        return {base, params};
    };

    const runMySQLQuery = async (withCollectionJoin: boolean) => {
        const {base, params} = buildBase(withCollectionJoin);
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
            `SELECT * ${base} ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?`,
            [...params, safeLimit, offset],
        );
        const [countRows] = await pool.query<mysql.RowDataPacket[]>(
            `SELECT COUNT(*) as total ${base}`,
            params,
        );

        return {rows, total: countRows[0]?.total ? Number(countRows[0].total) : 0};
    };

    let result;
    if (collection) {
        try {
            result = await runMySQLQuery(true);
        } catch (err) {
            console.error("Error fetching designs with collection join, falling back:", err);
            result = await runMySQLQuery(false);
        }
    } else {
        result = await runMySQLQuery(false);
    }

    // Convert rows to Design[]
    const designs: Design[] = result.rows.map(mapRowToDesign);

    return {designs, total: result.total};
}

export async function getDesignById(
    id: string,
): Promise<{ design: Design; relatedDesigns: Design[] } | null> {
    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const {data: designData, error} = await supabaseClient
            .from("designs")
            .select("*")
            .eq("id", id)
            .single();

        if (error) {
            // PGRST116: .single() matched no rows — a genuine "not found"
            if (error.code === "PGRST116") return null;
            console.error("Error fetching design:", error);
            throw new Error("Failed to fetch design", {cause: error});
        }
        if (!designData) return null;

        // Convert to Design
        const design: Design = {
            id: designData.id as string,
            externalId: designData.externalId as number,
            title: designData.title as string,
            externalLink: designData.externalLink as string,
            externalImageUrl: designData.externalImageUrl as string,
            category: designData.category as string,
            collection: normalizeCollection(designData.collection),
            imageName: designData.imageName as string,
            description: designData.description as string,
            keywords: designData.keywords as string,
            backgroundColors: designData.backgroundColors as string,
            backgroundColor: designData.backgroundColor as string,
            createdAt: designData.createdAt as string,
            updatedAt: designData.updatedAt as string,
            dimensions: designData.dimensions as string | undefined,
            material: designData.material as string | undefined,
            price: designData.price as number | undefined,
            inStock: designData.inStock as boolean | undefined,
            shared: designData.shared as boolean | undefined,
            props: designData.props as object | undefined,
        };

        // "More from this collection" only makes sense when the design has one;
        // an uncollected design would otherwise match legacy empty rows.
        const relatedDesigns: Design[] = design.collection
            ? await fetchRelatedByCollection(supabaseClient, design.collection, id)
            : [];

        return {design, relatedDesigns};
    }

    const pool = getMySQLPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM designs WHERE id = ?",
        [id],
    );

    if (!rows.length) {
        return null;
    }

    // Convert to Design
    const design: Design = mapRowToDesign(rows[0]);

    const relatedDesigns: Design[] = design.collection
        ? await fetchRelatedByCollectionMySQL(pool, design.collection, id)
        : [];

    return {design, relatedDesigns};
}

async function fetchRelatedByCollection(
    supabaseClient: ReturnType<typeof createClient>,
    collection: string,
    id: string,
): Promise<Design[]> {
    const {data: relatedData, error: relatedError} = await supabaseClient
        .from("designs")
        .select("*")
        .eq("collection", collection)
        .neq("id", id)
        .limit(5);

    if (relatedError) {
        console.error("Error fetching related designs:", relatedError);
        return [];
    }

    return (relatedData || []).map(mapSupabaseRowToDesign);
}

async function fetchRelatedByCollectionMySQL(
    pool: mysql.Pool,
    collection: string,
    id: string,
): Promise<Design[]> {
    const [relatedRows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM designs WHERE collection = ? AND id <> ? LIMIT 5",
        [collection, id],
    );

    return relatedRows.map(mapRowToDesign);
}

async function fetchLegacyCollections(provider: string): Promise<string[]> {
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const {data, error} = await supabaseClient
            .from("designs")
            .select("collection")
            .not("collection", "is", null)
            .neq("collection", "")
            .neq("collection", "no_collection");

        if (error) {
            console.error("Error fetching collections:", error);
            return [];
        }

        const collections = data
            .map(item => item.collection as string)
            .filter(Boolean);

        return Array.from(new Set(collections));
    }

    const pool = getMySQLPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT DISTINCT collection FROM designs WHERE collection IS NOT NULL AND collection != '' AND collection != 'no_collection' ORDER BY collection ASC",
    );

    return rows.map(row => row.collection as string);
}

function mapSupabaseRowToDesign(item: Record<string, unknown>): Design {
    return {
        id: item.id as string,
        externalId: item.externalId as number,
        title: item.title as string,
        externalLink: item.externalLink as string,
        externalImageUrl: item.externalImageUrl as string,
        category: item.category as string,
        collection: normalizeCollection(item.collection),
        imageName: item.imageName as string,
        description: item.description as string,
        keywords: item.keywords as string,
        backgroundColors: item.backgroundColors as string,
        backgroundColor: item.backgroundColor as string,
        createdAt: item.createdAt as string,
        updatedAt: item.updatedAt as string,
        dimensions: item.dimensions as string | undefined,
        material: item.material as string | undefined,
        price: item.price as number | undefined,
        inStock: item.inStock as boolean | undefined,
        shared: item.shared as boolean | undefined,
        props: item.props as object | undefined,
    };
}

export async function fetchRandomDesigns(
    limit: number,
    collection?: string,
    keywords: string[] = [],
): Promise<Design[]> {
    const safeLimit = Math.max(1, Math.min(12, Number.isInteger(limit) ? limit : 12));

    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();

        const runLegacyIdQuery = async () => {
            let query = supabaseClient.from("designs").select("id");
            if (collection) {
                query = query.eq("collection", collection);
            }
            if (keywords.length) {
                query = query.or(keywords.map(k => `keywords.ilike.%${k}%`).join(","));
            }
            return query;
        };

        const runJoinIdQuery = async (collectionTitle: string) => {
            let query = supabaseClient
                .from("designs")
                .select("id, design_collections!inner(collections!inner(title))")
                .eq("design_collections.collections.title", collectionTitle);
            if (keywords.length) {
                query = query.or(keywords.map(k => `keywords.ilike.%${k}%`).join(","));
            }
            return query;
        };

        let {data: idRows, error: idError} = collection
            ? await runJoinIdQuery(collection)
            : await runLegacyIdQuery();

        // Fall back to the legacy single-collection filter if the join errors
        // (tables not migrated yet) or matches nothing.
        if (collection && (idError || !idRows?.length)) {
            ({data: idRows, error: idError} = await runLegacyIdQuery());
        }

        if (idError) {
            console.error("Error fetching random design ids:", idError);
            return [];
        }

        const ids = (idRows || []).map(row => row.id as string);

        // Fisher-Yates shuffle
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }

        const pickedIds = ids.slice(0, safeLimit);
        if (!pickedIds.length) {
            return [];
        }

        const {data, error} = await supabaseClient.from("designs").select("*").in("id", pickedIds);

        if (error) {
            console.error("Error fetching random designs:", error);
            return [];
        }

        const designsById = new Map((data || []).map(item => [item.id as string, mapSupabaseRowToDesign(item)]));
        return pickedIds.map(id => designsById.get(id)).filter((d): d is Design => Boolean(d));
    }

    try {
        const pool = getMySQLPool();

        const buildBase = (withCollectionJoin: boolean) => {
            let base = "FROM designs WHERE 1";
            const params: (string | number)[] = [];
            if (collection) {
                base += withCollectionJoin
                    ? " AND (collection = ? OR EXISTS (SELECT 1 FROM design_collections dc JOIN collections c ON c.id = dc.collectionId WHERE dc.designId = designs.id AND c.title = ?))"
                    : " AND collection = ?";
                params.push(collection);
                if (withCollectionJoin) {
                    params.push(collection);
                }
            }
            if (keywords.length) {
                base += ` AND (${keywords.map(() => "LOWER(keywords) LIKE ?").join(" OR ")})`;
                keywords.forEach(k => params.push(`%${k}%`));
            }
            return {base, params};
        };

        const runMySQLQuery = async (withCollectionJoin: boolean) => {
            const {base, params} = buildBase(withCollectionJoin);
            const [queryRows] = await pool.query<mysql.RowDataPacket[]>(
                `SELECT * ${base} ORDER BY RAND() LIMIT ?`,
                [...params, safeLimit],
            );
            return queryRows;
        };

        let rows: mysql.RowDataPacket[];
        if (collection) {
            try {
                rows = await runMySQLQuery(true);
            } catch (err) {
                console.error("Error fetching random designs with collection join, falling back:", err);
                rows = await runMySQLQuery(false);
            }
        } else {
            rows = await runMySQLQuery(false);
        }

        return rows.map(mapRowToDesign);
    } catch (err) {
        console.error("Error fetching random designs:", err);
        return [];
    }
}

export async function updateDesignBackground(
    id: string,
    externalImageUrl: string,
    backgroundColor: string,
): Promise<void> {
    const provider = getProvider();
    const now = new Date();

    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const {error} = await supabaseClient
            .from("designs")
            .update({externalImageUrl, backgroundColor, updatedAt: now.toISOString()})
            .eq("id", id);

        if (error) {
            console.error("Error updating design background:", error);
            throw new Error("Failed to update design background", {cause: error});
        }
        return;
    }

    const pool = getMySQLPool();
    // A Date object here (not an ISO string with a trailing "Z") — mysql2 serializes it to
    // MySQL's own DATETIME format; a raw ISO string fails strict-mode TIMESTAMP parsing.
    await pool.query(
        "UPDATE designs SET externalImageUrl = ?, backgroundColor = ?, updatedAt = ? WHERE id = ?",
        [externalImageUrl, backgroundColor, now, id],
    );
}

export async function fetchCollections(): Promise<string[]> {
    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const {data, error} = await supabaseClient
            .from("collections")
            .select("title")
            .order("title");

        if (error || !data || !data.length) {
            return fetchLegacyCollections(provider);
        }

        return Array.from(new Set(data.map(item => item.title as string).filter(Boolean)));
    }

    try {
        const pool = getMySQLPool();
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
            "SELECT title FROM collections ORDER BY title",
        );

        if (!rows.length) {
            return fetchLegacyCollections(provider);
        }

        return Array.from(new Set(rows.map(row => row.title as string).filter(Boolean)));
    } catch (err) {
        console.error("Error fetching collections table, falling back:", err);
        return fetchLegacyCollections(provider);
    }
}
