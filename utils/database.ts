import {createClient} from "@supabase/supabase-js";
import mysql from "mysql2/promise";
import {SiteConfig} from "@/lib/store";
import {mapDataToConfig} from "@/lib/config";
import {ConfigProp} from "@/types/config";
import {Design} from "@/types/design";

const globalForMySQL = globalThis as unknown as { mysqlPool?: mysql.Pool };

let supabase: ReturnType<typeof createClient> | null = null;

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

export function mapRowToDesign(row: mysql.RowDataPacket): Design {
    return {
        id: row.id as string,
        externalId: row.externalId as number,
        title: row.title as string,
        externalLink: row.externalLink as string,
        externalImageUrl: row.externalImageUrl as string,
        category: row.category as string,
        collection: row.collection as string,
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

export async function getSiteConfig(): Promise<SiteConfig> {
    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const {data} = await supabaseClient.from("studio").select("*").returns<ConfigProp[]>();
        return mapDataToConfig(data || []);
    }

    const pool = getMySQLPool();
    const [rows] = await pool.query<mysql.RowDataPacket[] & ConfigProp[]>("SELECT * FROM studio");
    return mapDataToConfig(rows);
}

export async function fetchDesigns(
    page: number,
    searchQuery: string,
    collection: string,
    itemsPerPage = 12,
): Promise<{ designs: Design[]; total: number }> {
    const safePage = Math.max(1, Number.isInteger(page) ? page : 1);
    const safeLimit = Math.max(1, Math.min(100, Number.isInteger(itemsPerPage) ? itemsPerPage : 12));
    const offset = (safePage - 1) * safeLimit;

    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const start = offset;
        const end = offset + safeLimit - 1;

        let query = supabaseClient.from("designs").select("*", {count: "exact"});
        if (searchQuery) {
            query = query.ilike("title", `%${searchQuery}%`);
        }
        if (collection) {
            query = query.eq("collection", collection);
        }

        query = query.order("createdAt", { ascending: false });

        const {data, error, count} = await query.range(start, end);
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
            collection: item.collection as string,
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
    let base = "FROM designs WHERE 1";
    const params: (string | number)[] = [];

    if (searchQuery) {
        base += " AND title LIKE ?";
        params.push(`%${searchQuery}%`);
    }
    if (collection) {
        base += " AND collection = ?";
        params.push(collection);
    }

    const [rows] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT * ${base} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
        [...params, safeLimit, offset],
    );
    const [countRows] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) as total ${base}`,
        params,
    );

    // Convert rows to Design[]
    const designs: Design[] = rows.map(mapRowToDesign);

    const total = countRows[0]?.total ? Number(countRows[0].total) : 0;
    return {designs, total};
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

        if (error || !designData) {
            console.error("Error fetching design:", error);
            return null;
        }

        // Convert to Design
        const design: Design = {
            id: designData.id as string,
            externalId: designData.externalId as number,
            title: designData.title as string,
            externalLink: designData.externalLink as string,
            externalImageUrl: designData.externalImageUrl as string,
            category: designData.category as string,
            collection: designData.collection as string,
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

        const {data: relatedData, error: relatedError} = await supabaseClient
            .from("designs")
            .select("*")
            .eq("collection", design.collection || "")
            .neq("id", id)
            .limit(3);

        if (relatedError) {
            console.error("Error fetching related designs:", relatedError);
        }

        // Convert to Design[]
        const relatedDesigns: Design[] = (relatedData || []).map(item => ({
            id: item.id as string,
            externalId: item.externalId as number,
            title: item.title as string,
            externalLink: item.externalLink as string,
            externalImageUrl: item.externalImageUrl as string,
            category: item.category as string,
            collection: item.collection as string,
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

    const [relatedRows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM designs WHERE collection = ? AND id <> ? LIMIT 3",
        [design.collection || "", id],
    );

    // Convert to Design[]
    const relatedDesigns: Design[] = relatedRows.map(mapRowToDesign);

    return {design, relatedDesigns};
}

export async function fetchCollections(): Promise<string[]> {
    const provider = getProvider();
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
