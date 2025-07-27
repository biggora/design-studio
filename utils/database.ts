import {createClient} from "@supabase/supabase-js";
import mysql from "mysql2/promise";
import {SiteConfig} from "@/lib/store";
import {mapDataToConfig} from "@/lib/config";
import {ConfigProp} from "@/types/config";
import {Design} from "@/types/design";

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
    const {MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE} = process.env;

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
        const {data} = await supabase!.from("studio").select("*").returns<ConfigProp[]>();
        return mapDataToConfig(data || []);
    }

    const [rows] = await pool!.query<mysql.RowDataPacket[] & ConfigProp[]>("SELECT * FROM studio");
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

        let query = supabase!.from("designs").select("*", {count: "exact"});
        if (searchQuery) {
            query = query.ilike("title", `%${searchQuery}%`);
        }
        if (collection) {
            query = query.eq("collection", collection);
        }

        const {data, error, count} = await query.range(start, end);
        if (error) {
            console.error("Error fetching designs:", error);
            return {designs: [], total: 0};
        }

        // Convert data to Design[] using appropriate type checking
        const designs: Design[] = (data || []).map(item => ({
            id: item.id as number,
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

    const offset = (page - 1) * itemsPerPage;
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

    const [rows] = await pool!.query<mysql.RowDataPacket[]>(
        `SELECT * ${base} LIMIT ? OFFSET ?`,
        [...params, itemsPerPage, offset],
    );
    const [countRows] = await pool!.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) as total ${base}`,
        params,
    );

    // Convert rows to Design[]
    const designs: Design[] = rows.map(row => ({
        id: row.id as number,
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
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        dimensions: row.dimensions as string | undefined,
        material: row.material as string | undefined,
        price: row.price as number | undefined,
        inStock: row.inStock as boolean | undefined,
        shared: row.shared as boolean | undefined,
        props: row.props as object | undefined,
    }));

    const total = countRows[0]?.total ? Number(countRows[0].total) : 0;
    return {designs, total};
}

export async function getDesignById(
    id: string,
): Promise<{ design: Design; relatedDesigns: Design[] } | null> {
    if (provider === "supabase") {
        const {data: designData, error} = await supabase!
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
            id: designData.id as number,
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

        const {data: relatedData, error: relatedError} = await supabase!
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
            id: item.id as number,
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

    const [rows] = await pool!.query<mysql.RowDataPacket[]>(
        "SELECT * FROM designs WHERE id = ?",
        [id],
    );
    
    if (!rows.length) {
        return null;
    }
    
    // Convert to Design
    const row = rows[0];
    const design: Design = {
        id: row.id as number,
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
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        dimensions: row.dimensions as string | undefined,
        material: row.material as string | undefined,
        price: row.price as number | undefined,
        inStock: row.inStock as boolean | undefined,
        shared: row.shared as boolean | undefined,
        props: row.props as object | undefined,
    };

    const [relatedRows] = await pool!.query<mysql.RowDataPacket[]>(
        "SELECT * FROM designs WHERE collection = ? AND id <> ? LIMIT 3",
        [design.collection || "", id],
    );

    // Convert to Design[]
    const relatedDesigns: Design[] = relatedRows.map(row => ({
        id: row.id as number,
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
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        dimensions: row.dimensions as string | undefined,
        material: row.material as string | undefined,
        price: row.price as number | undefined,
        inStock: row.inStock as boolean | undefined,
        shared: row.shared as boolean | undefined,
        props: row.props as object | undefined,
    }));

    return {design, relatedDesigns};
}

export async function fetchCollections(): Promise<string[]> {
    if (provider === "supabase") {
        const {data, error} = await supabase!
            .from("designs")
            .select("collection")
            .not("collection", "is", null);

        if (error) {
            console.error("Error fetching collections:", error);
            return [];
        }

        const collections = data
            .map(item => item.collection as string)
            .filter(Boolean);
        
        return Array.from(new Set(collections));
    }

    const [rows] = await pool!.query<mysql.RowDataPacket[]>(
        "SELECT DISTINCT collection FROM designs WHERE collection IS NOT NULL",
    );
    
    return rows.map(row => row.collection as string);
}