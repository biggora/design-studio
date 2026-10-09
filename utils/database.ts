import {cache} from "react";
import {unstable_cache} from "next/cache";
import {createClient} from "@supabase/supabase-js";
import mysql from "mysql2/promise";
import {SiteConfig} from "@/lib/store";
import {mapDataToConfig} from "@/lib/config";
import {ConfigProp} from "@/types/config";
import {Design} from "@/types/design";
import {designSlugBase} from "@/lib/slug";
import {IngestInput, IngestResult, IngestDesign, DesignListing, ListingLookup, ListingsError, ListingPlatform} from "@/lib/listings";
import {ingestListingMySQL, ingestDesignResponse, mysqlListingResponse} from "@/utils/listings-database";
import {SocialPost, SocialPostFilters, SocialPostIngestInput, SocialPostIngestResult, SocialPostList, SocialSummaryFilters, SocialSummaryRow} from "@/lib/social-posts";
import {upsertSocialPostMySQL, listSocialPostsMySQL, summarizeSocialPostsMySQL} from "@/utils/social-posts-database";
import {hasMarketplaceLink} from "@/lib/utils";
import {getDesignDisplayImage} from "@/lib/image";

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
        externalId: (row.externalId as number | null) ?? null,
        title: row.title as string,
        slug: (row.slug as string | null) ?? null,
        externalLink: (row.externalLink as string | null) ?? "",
        externalImageUrl: (row.externalImageUrl as string | null) ?? "",
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
        const designs: Design[] = (data || []).map(mapSupabaseRowToDesign);

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

// column is always one of the literal values below (never user input), so it's safe to interpolate into the MySQL query.
async function getDesignBy(
    column: "id" | "slug",
    value: string,
): Promise<{ design: Design; relatedDesigns: Design[] } | null> {
    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const {data: designData, error} = await supabaseClient
            .from("designs")
            .select("*")
            .eq(column, value)
            .single();

        if (error) {
            // PGRST116: .single() matched no rows — a genuine "not found"
            if (error.code === "PGRST116") return null;
            console.error("Error fetching design:", error);
            throw new Error("Failed to fetch design", {cause: error});
        }
        if (!designData) return null;

        // Convert to Design
        const design: Design = mapSupabaseRowToDesign(designData);

        // "More from this collection" only makes sense when the design has one;
        // an uncollected design would otherwise match legacy empty rows.
        const relatedDesigns: Design[] = design.collection
            ? await fetchRelatedByCollection(supabaseClient, design.collection, design.id)
            : [];

        return {design, relatedDesigns};
    }

    const pool = getMySQLPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT * FROM designs WHERE ${column} = ? LIMIT 1`,
        [value],
    );

    if (!rows.length) {
        return null;
    }

    // Convert to Design
    const design: Design = mapRowToDesign(rows[0]);

    const relatedDesigns: Design[] = design.collection
        ? await fetchRelatedByCollectionMySQL(pool, design.collection, design.id)
        : [];

    return {design, relatedDesigns};
}

export async function getDesignById(
    id: string,
): Promise<{ design: Design; relatedDesigns: Design[] } | null> {
    return getDesignBy("id", id);
}

export async function getDesignBySlug(
    slug: string,
): Promise<{ design: Design; relatedDesigns: Design[] } | null> {
    return getDesignBy("slug", slug);
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
        externalId: (item.externalId as number | null) ?? null,
        title: item.title as string,
        slug: (item.slug as string | null) ?? null,
        externalLink: (item.externalLink as string | null) ?? "",
        externalImageUrl: (item.externalImageUrl as string | null) ?? "",
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

export type FeedCollection = { title: string; description: string };
export type FeedDesigns = { designs: Design[]; earliestListingAt: Record<string, string> };

/** Collections with their descriptions, for the Pinterest feed index. Legacy installs
 * without the `collections` tables fall back to the `designs.collection` labels with an
 * empty description. Titles are deduped like fetchCollections does. */
export async function fetchFeedCollections(): Promise<FeedCollection[]> {
    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const {data, error} = await supabaseClient
            .from("collections")
            .select("title, description")
            .order("title");

        if (error || !data || !data.length) {
            if (error) console.error("Error fetching feed collections:", error);
            const legacy = await fetchLegacyCollections(provider);
            return legacy.map(title => ({title, description: ""}));
        }

        return dedupeFeedCollections(data.map(row => ({
            title: row.title as string,
            description: (row.description as string | null) ?? "",
        })));
    }

    try {
        const pool = getMySQLPool();
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
            "SELECT title, description FROM collections ORDER BY title",
        );

        if (!rows.length) {
            const legacy = await fetchLegacyCollections(provider);
            return legacy.map(title => ({title, description: ""}));
        }

        return dedupeFeedCollections(rows.map(row => ({
            title: row.title as string,
            description: (row.description as string | null) ?? "",
        })));
    } catch (err) {
        console.error("Error fetching feed collections table, falling back:", err);
        const legacy = await fetchLegacyCollections(provider);
        return legacy.map(title => ({title, description: ""}));
    }
}

function dedupeFeedCollections(collections: FeedCollection[]): FeedCollection[] {
    const byTitle = new Map<string, FeedCollection>();
    for (const collection of collections) {
        if (collection.title && !byTitle.has(collection.title)) {
            byTitle.set(collection.title, collection);
        }
    }
    return [...byTitle.values()];
}

// MySQL DATETIME comes back TZ-less through dateStrings; the rest of the codebase
// (utils/social-posts-database.ts) reads it as UTC, so the feed does too.
function isoTime(value: unknown): string {
    return new Date(`${String(value).replace(" ", "T")}Z`).toISOString();
}

/** Designs for one collection's Pinterest feed, newest first, already filtered and capped:
 * must have a display image and a marketplace link, and must not already be pinned
 * through the API (a `design_social_posts` row with channel 'pinterest', status
 * 'published' — so RSS auto-publish and pod-uploader never pin the same design twice).
 * `earliestListingAt` maps design id → the earliest design_listings.publishedAt, used
 * as the feed's pubDate. There is no hidden/trashed column in the schema (the `shared`
 * flag is vestigial and always false), so removal state is exactly the social-post row. */
export async function fetchCollectionFeedDesigns(
    collectionTitle: string,
    limit: number,
): Promise<FeedDesigns> {
    const safeLimit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 100));
    // Over-fetch so post-JSON checks (TeePublic link in props, display image) can
    // only shrink the result, not displace older eligible designs.
    const fetchLimit = Math.min(safeLimit * 3, 300);

    const finalize = async (rows: Design[]): Promise<FeedDesigns> => {
        const unique = new Map(rows.map(design => [design.id, design]));
        const designs = [...unique.values()]
            .filter(design => hasMarketplaceLink(design) && getDesignDisplayImage(design).trim() !== "")
            .slice(0, safeLimit);
        return {designs, earliestListingAt: await fetchEarliestListingAt(designs)};
    };

    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();

        type FeedQueryResult = {data: Record<string, unknown>[] | null; error: {message: string} | null};

        const runJoinQuery = async (): Promise<FeedQueryResult> => {
            const {data, error} = await supabaseClient
                .from("designs")
                .select("*, design_collections!inner(collections!inner(title))")
                .eq("design_collections.collections.title", collectionTitle)
                // Display image = mockup prop or the artwork URL (getDesignDisplayImage);
                // pod-studio rows often carry only the mockup.
                .or("externalImageUrl.neq.,props->>mockup_tshirt.not.is.null")
                .order("createdAt", {ascending: false})
                .order("id", {ascending: false})
                .range(0, fetchLimit - 1);
            return {data: (data ?? null) as Record<string, unknown>[] | null, error};
        };

        const runLegacyQuery = async (): Promise<FeedQueryResult> => {
            const {data, error} = await supabaseClient
                .from("designs")
                .select("*")
                .eq("collection", collectionTitle)
                .or("externalImageUrl.neq.,props->>mockup_tshirt.not.is.null")
                .order("createdAt", {ascending: false})
                .order("id", {ascending: false})
                .range(0, fetchLimit - 1);
            return {data: (data ?? null) as Record<string, unknown>[] | null, error};
        };

        const joinResponse = await runJoinQuery();
        // Fall back to the legacy single-collection filter if the join errors
        // (tables not migrated yet) or matches nothing.
        const response = joinResponse.error || !joinResponse.data?.length
            ? await runLegacyQuery()
            : joinResponse;
        if (response.error) {
            console.error("Error fetching feed designs:", response.error);
            return {designs: [], earliestListingAt: {}};
        }

        let designs: Design[] = (response.data ?? []).map(mapSupabaseRowToDesign);
        designs = await excludeApiPinnedDesigns(supabaseClient, designs);
        return finalize(designs);
    }

    const pool = getMySQLPool();

    const runMySQLQuery = async (excludePinned: boolean) => {
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
            `SELECT d.* FROM designs d
             WHERE EXISTS (SELECT 1 FROM design_collections dc JOIN collections c ON c.id = dc.collectionId
                           WHERE dc.designId = d.id AND c.title = ?)
               AND (COALESCE(d.externalImageUrl, '') <> '' OR JSON_EXTRACT(d.props, '$.mockup_tshirt') IS NOT NULL)
               ${excludePinned ? `AND NOT EXISTS (SELECT 1 FROM design_social_posts sp
                                  WHERE sp.designId = d.id AND sp.channel = 'pinterest' AND sp.status = 'published')` : ""}
             ORDER BY d.createdAt DESC, d.id DESC LIMIT ?`,
            [collectionTitle, fetchLimit],
        );
        return rows.map(mapRowToDesign);
    };

    let designs: Design[];
    try {
        designs = await runMySQLQuery(true);
    } catch (err) {
        // A pre-migration-004 install has no design_social_posts table; fail open
        // (feed without the already-pinned exclusion) rather than serving no feed.
        console.error("Error fetching feed designs with social-post exclusion, retrying without it:", err);
        try {
            designs = await runMySQLQuery(false);
        } catch (retryErr) {
            console.error("Error fetching feed designs:", retryErr);
            return {designs: [], earliestListingAt: {}};
        }
    }
    return finalize(designs);
}

// Supabase keeps the exclusion out-of-band (private table, separate query). A read
// failure here (e.g. anon key without service role) is logged and the feed continues
// without the exclusion — a broken feed would stop auto-publish entirely.
async function excludeApiPinnedDesigns(
    supabaseClient: ReturnType<typeof createClient>,
    designs: Design[],
): Promise<Design[]> {
    if (!designs.length) return designs;
    const ids = designs.map(design => design.id);
    const {data, error} = await supabaseClient
        .from("design_social_posts")
        .select("designId")
        .in("designId", ids)
        .eq("channel", "pinterest")
        .eq("status", "published");
    if (error) {
        console.error("Error fetching pinterest social posts for feed exclusion:", error);
        return designs;
    }
    const pinned = new Set((data || []).map(row => row.designId as string));
    return pinned.size ? designs.filter(design => !pinned.has(design.id)) : designs;
}

async function fetchEarliestListingAt(designs: Design[]): Promise<Record<string, string>> {
    if (!designs.length) return {};
    const ids = designs.map(design => design.id);
    const earliest: Record<string, string> = {};
    if (getProvider() === "supabase") {
        const {data, error} = await getSupabase().from("design_listings")
            .select("designId, publishedAt").in("designId", ids);
        if (error) {
            console.error("Error fetching listing dates for feed:", error);
            return {};
        }
        for (const row of data || []) {
            const designId = row.designId as string;
            const publishedAt = row.publishedAt as string | null;
            if (!publishedAt) continue;
            if (!earliest[designId] || publishedAt < earliest[designId]) {
                earliest[designId] = publishedAt;
            }
        }
        return earliest;
    }
    try {
        const [rows] = await getMySQLPool().query<mysql.RowDataPacket[]>(
            "SELECT designId, MIN(publishedAt) AS earliest FROM design_listings WHERE designId IN (?) GROUP BY designId",
            [ids],
        );
        for (const row of rows) {
            if (row.earliest) earliest[row.designId as string] = isoTime(row.earliest);
        }
    } catch (err) {
        console.error("Error fetching listing dates for feed:", err);
    }
    return earliest;
}

export async function ingestListing(input: IngestInput): Promise<IngestResult> {
    if (getProvider() === "mysql") return ingestListingMySQL(getMySQLPool(), input);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new ListingsError(503, "NOT_CONFIGURED", "SUPABASE_SERVICE_ROLE_KEY is required for listings ingest");
    }
    const {data, error} = await getSupabase().rpc("ingest_design_listing", {
        payload: input,
        slug_base: designSlugBase(input.design.title, input.design.sourceImageId),
    });
    if (error) {
        if (error.code === "P0001" || error.code === "23505") {
            let details: unknown = error.details;
            try { details = JSON.parse(error.details); } catch { /* Postgres may return plain text. */ }
            throw new ListingsError(409, "CONFLICT", error.message, undefined, details);
        }
        throw new Error("Failed to ingest listing", {cause: error});
    }
    return data as IngestResult;
}

async function socialRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new ListingsError(503, "NOT_CONFIGURED", "SUPABASE_SERVICE_ROLE_KEY is required for social posts");
    }
    const {data, error} = await getSupabase().rpc(name, args);
    if (error) {
        if (error.code === "P0002") throw new ListingsError(404, "NOT_FOUND", "Design not found", "design");
        if (error.code === "P0001" || error.code === "23505") {
            let details: unknown = error.details;
            try { details = JSON.parse(error.details); } catch { /* Postgres may return plain text. */ }
            throw new ListingsError(409, "CONFLICT", error.message, undefined, details);
        }
        throw new Error(`Failed to run ${name}`, {cause: error});
    }
    return data as T;
}

// Postgres returns timestamptz as offset strings; normalize to the same ISO form as MySQL.
function normalizeSocialPost(post: SocialPost): SocialPost {
    const iso = (value: string) => new Date(value).toISOString();
    return {...post, publishedAt: iso(post.publishedAt), removedAt: post.removedAt ? iso(post.removedAt) : null,
        createdAt: iso(post.createdAt), updatedAt: iso(post.updatedAt)};
}

export async function upsertSocialPost(input: SocialPostIngestInput): Promise<SocialPostIngestResult> {
    if (getProvider() === "mysql") return upsertSocialPostMySQL(getMySQLPool(), input);
    const result = await socialRpc<SocialPostIngestResult>("upsert_design_social_post", {payload: input});
    return {...result, post: normalizeSocialPost(result.post)};
}

export async function listSocialPosts(filters: SocialPostFilters): Promise<SocialPostList> {
    if (getProvider() === "mysql") return listSocialPostsMySQL(getMySQLPool(), filters);
    const result = await socialRpc<{data: SocialPostList["data"]; total: number}>("list_design_social_posts", {filters});
    return {
        data: result.data.map(item => ({...item, post: normalizeSocialPost(item.post)})),
        pagination: {page: filters.page, limit: filters.limit, total: Number(result.total)},
    };
}

export async function summarizeSocialPosts(filters: SocialSummaryFilters): Promise<SocialSummaryRow[]> {
    if (getProvider() === "mysql") return summarizeSocialPostsMySQL(getMySQLPool(), filters);
    const result = await socialRpc<{data: SocialSummaryRow[]}>("summarize_design_social_posts", {filters});
    return result.data.map(row => ({...row, count: Number(row.count)}));
}

export async function getDesignListings(lookup: ListingLookup): Promise<{design: IngestDesign; listings: DesignListing[]} | null> {
    const field = "sha256" in lookup ? "sha256" : "sourceImageId";
    const value = "sha256" in lookup ? lookup.sha256 : lookup.sourceImageId;
    if (getProvider() === "supabase") {
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new ListingsError(503, "NOT_CONFIGURED", "SUPABASE_SERVICE_ROLE_KEY is required for listings lookup");
        }
        const client = getSupabase();
        const {data: design, error} = await client.from("designs")
            .select("id, slug, title, externalId, sha256, sourceImageId").eq(field, value).maybeSingle();
        if (error) throw new Error("Failed to look up design", {cause: error});
        if (!design) return null;
        const {data: listings, error: listingError} = await client.from("design_listings")
            .select("id, platform, account, externalId, url, title, tags, thumbnailUrl, publishedAt, extra")
            .eq("designId", design.id as string).order("createdAt").order("id");
        if (listingError) throw new Error("Failed to look up listings", {cause: listingError});
        return {design: design as IngestDesign, listings: listings as DesignListing[]};
    }
    const pool = getMySQLPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(`SELECT * FROM designs WHERE ${field} = ?`, [value]);
    if (!rows.length) return null;
    const [listings] = await pool.query<mysql.RowDataPacket[]>("SELECT * FROM design_listings WHERE designId = ? ORDER BY createdAt, id", [rows[0].id]);
    return {design: ingestDesignResponse(rows[0] as mysql.RowDataPacket & IngestDesign), listings: listings.map(mysqlListingResponse)};
}

// Project only public marketplace links; account, source identity and extra never leave
// the authenticated lookup endpoint. Batch one query per API response, not per design.
export async function fetchPublicListings(ids: string[]): Promise<Record<string, {platform: ListingPlatform; url: string}[]>> {
    if (!ids.length) return {};
    let rows: {designId: string; platform: ListingPlatform; url: string}[];
    if (getProvider() === "supabase") {
        const {data, error} = await getSupabase().from("design_listings")
            .select("designId, platform, url").in("designId", ids).order("platform").order("url");
        if (error) throw new Error("Failed to load public listing links", {cause: error});
        rows = data as typeof rows;
    } else {
        const [data] = await getMySQLPool().query<mysql.RowDataPacket[]>(
            "SELECT designId, platform, url FROM design_listings WHERE designId IN (?) ORDER BY platform, url", [ids]);
        rows = data as mysql.RowDataPacket[] & typeof rows;
    }
    const byDesign: Record<string, {platform: ListingPlatform; url: string}[]> = {};
    for (const row of rows) (byDesign[row.designId] ??= []).push({platform: row.platform, url: row.url});
    return byDesign;
}
