import { normalizeOgImage } from "@/lib/og-image";
import type { OgLookup, OgWrite, OgWriteResult, OgContext } from "@/lib/og-image";
import { setOgImageMySQL } from "@/utils/og-image-database";
import {cache} from "react";
import {unstable_cache} from "next/cache";
import {createClient} from "@supabase/supabase-js";
import mysql from "mysql2/promise";
import {normalizePinterestImage} from "@/lib/pinterest-image";
import type {PinLookup, PinWrite, PinWriteResult, PinContext} from "@/lib/pinterest-image";
import {setPinterestImageMySQL} from "@/utils/pinterest-image-database";
import {isProductUrl} from "@pod/pinterest-renderer/contract";
import {SiteConfig} from "@/lib/store";
import {mapDataToConfig} from "@/lib/config";
import {ConfigProp} from "@/types/config";
import {Design} from "@/types/design";
import {designSlugBase} from "@/lib/slug";
import {IngestInput, IngestResult, IngestDesign, DesignListing, ListingLookup, ListingsError, ListingPlatform, CdnImage, CdnImageItem, CdnImageLookup, CdnImageResult} from "@/lib/listings";
import {getDesignCdnImageMySQL, setDesignCdnImageMySQL} from "@/utils/cdn-image-database";
import {ingestListingMySQL, ingestDesignResponse, mysqlListingResponse} from "@/utils/listings-database";
import {SocialPost, SocialPostFilters, SocialPostIngestInput, SocialPostIngestResult, SocialPostList, SocialPostTarget, SocialSummaryFilters, SocialSummaryRow} from "@/lib/social-posts";
import {upsertSocialPostMySQL, listSocialPostsMySQL, summarizeSocialPostsMySQL, deleteSocialPostMySQL} from "@/utils/social-posts-database";
import {hasMarketplaceLink} from "@/lib/utils";
import {hasPinImage, normalizeCdnArtworkOptions, normalizeCdnImageMockups} from "@/lib/image";
import {getSearchTerms, rankSearchDesigns} from "@/lib/catalog-search";
import {CollectionPage, curatedCollectionTitles, getCollectionPages} from "@/lib/collections";
import {GiftPage, getGiftPages} from "@/lib/gifts";
import {assignCollectionSlugs, assignDesignsToFeeds} from "@/lib/pinterest-feed";
import {createHash, randomUUID} from "node:crypto";
import type {ArticleAnnouncement, ArticleRecord, ArticleTarget, PublishedArticle} from "@/lib/articles";
import {resolveArticlePublications} from "@/lib/article-publication";
import {articleIsDue, articleIsVisible, ArticleScheduleError, parseArticleShowAt} from "@/lib/article-scheduling";

function requireArticleAccess() {
    if (getProvider() === "supabase" && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for articles");
    }
}

export async function upsertArticleAnnouncement(article: ArticleAnnouncement, showAt?: string): Promise<void> {
    requireArticleAccess();
    const revision = createHash("sha256").update(JSON.stringify(article)).digest("hex");
    const schedule = showAt !== undefined ? {
        showAt: parseArticleShowAt(showAt), status: "scheduled", shownAt: null,
        scheduleRevision: randomUUID(), publication: null, lastError: null,
    } : {};
    if (getProvider() === "mysql") {
        const input = {...article, ...schedule, revision};
        if (input.showAt) input.showAt = input.showAt.slice(0, 23).replace("T", " ");
        const fields = Object.keys(input);
        await getMySQLPool().query(
            `INSERT INTO article_announcements (${fields.map(f => `\`${f}\``).join(",")}) VALUES (${fields.map(() => "?").join(",")})
             ON DUPLICATE KEY UPDATE checkedAt = ${showAt !== undefined ? "NULL" : "IF(revision = VALUES(revision), checkedAt, NULL)"},
             ${fields.filter(f => f !== "blog" && f !== "sourceArticleId" && f !== "revision").map(f => `\`${f}\` = VALUES(\`${f}\`)`).join(",")}, revision = VALUES(revision)`,
            Object.values(input),
        );
        return;
    }
    // Do not overwrite the last verified public snapshot on content updates.
    const {data: existing, error: readError} = await getSupabase().from("article_announcements")
        .select("revision,checkedAt").eq("blog", article.blog).eq("sourceArticleId", article.sourceArticleId).maybeSingle();
    if (readError) throw new Error("Failed to read article revision");
    const {error} = await getSupabase().from("article_announcements").upsert({
        ...article, revision, checkedAt: showAt === undefined && existing?.revision === revision ? existing.checkedAt : null, ...schedule,
    }, {onConflict: "blog,sourceArticleId"});
    if (error) throw new Error("Failed to save article announcement");
}

function normalizeArticleRecord(row: Record<string, unknown>): ArticleRecord {
    const iso = (value: unknown) => {
        if (!value) return null;
        const timestamp = String(value).replace(" ", "T");
        return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? timestamp : `${timestamp}Z`).toISOString();
    };
    return {...row, checkedAt: iso(row.checkedAt), showAt: iso(row.showAt), shownAt: iso(row.shownAt),
        publication: typeof row.publication === "string" ? JSON.parse(row.publication) : row.publication,
    } as ArticleRecord;
}

export async function fetchArticleAnnouncements(target?: ArticleTarget): Promise<ArticleRecord[]> {
    requireArticleAccess();
    if (getProvider() === "mysql") {
        const [rows] = await getMySQLPool().query<mysql.RowDataPacket[]>(`SELECT * FROM article_announcements${target ? " WHERE blog = ? AND sourceArticleId = ?" : ""} ORDER BY blog, sourceArticleId`, target ? [target.blog, target.sourceArticleId] : []);
        return rows.map(normalizeArticleRecord);
    }
    const rows: ArticleRecord[] = [];
    for (let offset = 0; ; offset += 1000) {
        let query = getSupabase().from("article_announcements").select("*");
        if (target) query = query.eq("blog", target.blog).eq("sourceArticleId", target.sourceArticleId);
        const {data, error} = await query.order("blog").order("sourceArticleId").range(offset, offset + 999);
        if (error) throw new Error("Failed to read article announcements");
        rows.push(...data.map(row => normalizeArticleRecord(row)));
        if (data.length < 1000) return rows;
    }
}

export async function setArticleSchedule(target: ArticleTarget, action: "schedule" | "cancel" | "now", showAt?: string): Promise<ArticleRecord> {
    requireArticleAccess();
    const values = {
        status: action === "cancel" ? "cancelled" : "scheduled",
        showAt: action === "cancel" ? null : action === "now" ? new Date().toISOString() : parseArticleShowAt(showAt),
        shownAt: null, publication: null, checkedAt: null, lastError: null, scheduleRevision: randomUUID(),
    };
    if (getProvider() === "mysql") {
        const [result] = await getMySQLPool().query<mysql.ResultSetHeader>(
            "UPDATE article_announcements SET status = ?, showAt = ?, shownAt = NULL, publication = NULL, checkedAt = NULL, lastError = NULL, scheduleRevision = ? WHERE blog = ? AND sourceArticleId = ?",
            [values.status, values.showAt?.slice(0, 23).replace("T", " ") ?? null, values.scheduleRevision, target.blog, target.sourceArticleId]);
        if (!result.affectedRows) throw new ArticleScheduleError("Article announcement not found", 404);
        return (await fetchArticleAnnouncements(target))[0];
    }
    const {data, error} = await getSupabase().from("article_announcements").update(values)
        .eq("blog", target.blog).eq("sourceArticleId", target.sourceArticleId).select("*").maybeSingle();
    if (error) throw new Error("Failed to change article schedule");
    if (!data) throw new ArticleScheduleError("Article announcement not found", 404);
    return normalizeArticleRecord(data);
}

/** Compare content AND scheduling revisions: a cancelled/moved check cannot release its stale snapshot. */
export async function saveArticlePublication(article: ArticleRecord, publication: PublishedArticle | null, checkedAt: string, lastError: string | null = null): Promise<boolean> {
    requireArticleAccess();
    const status = article.status ?? "automatic";
    const releasing = status === "scheduled" && publication !== null && lastError === null;
    const nextStatus = releasing ? "published" : status;
    const shownAt = releasing ? checkedAt : article.shownAt ?? null;
    if (getProvider() === "mysql") {
        const [result] = await getMySQLPool().query<mysql.ResultSetHeader>(
            "UPDATE article_announcements SET publication = ?, checkedAt = ?, status = ?, shownAt = ?, lastError = ? WHERE blog = ? AND sourceArticleId = ? AND revision = ? AND scheduleRevision = ? AND status = ? AND (showAt IS NULL OR showAt <= ?)",
            [publication ? JSON.stringify(publication) : null, checkedAt.slice(0, 23).replace("T", " "), nextStatus,
                shownAt?.slice(0, 23).replace("T", " ") ?? null, lastError, article.blog, article.sourceArticleId, article.revision, article.scheduleRevision ?? "", status, checkedAt.slice(0, 23).replace("T", " ")]);
        return result.affectedRows > 0;
    }
    const {data, error} = await getSupabase().from("article_announcements").update({publication, checkedAt, status: nextStatus, shownAt, lastError})
        .eq("blog", article.blog).eq("sourceArticleId", article.sourceArticleId).eq("revision", article.revision)
        .eq("scheduleRevision", article.scheduleRevision ?? "").eq("status", status)
        .or(`showAt.is.null,showAt.lte.${checkedAt}`).select("sourceArticleId");
    if (error) throw new Error("Failed to save article publication check");
    return Boolean(data?.length);
}

export async function processArticleAnnouncements(options: {target?: ArticleTarget; limit?: number; includeScheduled?: boolean} = {}) {
    const apiKey = process.env.TUMBLR_API_KEY?.trim();
    const result = {processed: 0, published: 0, waiting: 0, failed: 0, superseded: 0, changed: 0, disabled: !apiKey};
    // An optional integration must not attempt verification or write checks when unconfigured.
    if (!apiKey) return result;
    const rows = await fetchArticleAnnouncements(options.target);
    const now = Date.now();
    const due = rows.filter(row => articleIsDue(row, now, options.includeScheduled ?? true))
        .sort((a, b) => (a.checkedAt ?? "").localeCompare(b.checkedAt ?? ""))
        .slice(0, options.limit ?? 25);
    result.processed = due.length;
    if (due.length) {
        let verified: Map<string, PublishedArticle | null> | undefined;
        try {
            verified = await resolveArticlePublications(due, apiKey);
        } catch {
            // Never log request URLs: they carry the Tumblr API key.
            console.error("Article publication verification unavailable; keeping the last verified articles");
        }
        const checkedAt = new Date().toISOString();
        for (const row of due) {
            let publication = verified ? verified.get(`${row.blog}:${row.sourceArticleId}`) ?? null : row.status === "scheduled" ? null : row.publication;
            if (publication && (row.status === "scheduled" || row.shownAt)) {
                publication = {...publication, publishedAt: row.shownAt ?? checkedAt};
            }
            const saved = await saveArticlePublication(row, publication, checkedAt, verified ? null : "tumblr_verification_unavailable");
            if (!saved) { result.superseded++; continue; }
            if (!verified) result.failed++;
            else if (!publication) result.waiting++;
            else result.published++;
            if (JSON.stringify(publication) !== JSON.stringify(row.publication)) result.changed++;
        }
    }
    return result;
}

/** Legacy reads retain their behavior; scheduled releases require the independent processor. */
export const fetchPublishedArticles = cache(async (): Promise<PublishedArticle[]> => {
    try {
        await processArticleAnnouncements({includeScheduled: false});
    } catch {
        // Verification persistence is optional for public rendering; never expose an unsaved result.
        console.error("Article publication refresh unavailable; keeping the last verified articles");
    }
    // Read again so a concurrent cancellation/reschedule wins over a check that was in flight.
    return (await fetchArticleAnnouncements()).filter(row => articleIsVisible(row))
        .flatMap(row => row.publication ? [row.publication] : [])
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.sourceArticleId.localeCompare(b.sourceArticleId));
});

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

export async function getPinterestContexts(lookup: PinLookup | null, page: number, limit: number, brand: string) {
    return getSocialImageContexts("pinterest", lookup, page, limit, brand);
}
export async function getOgContexts(lookup: OgLookup | null, page: number, limit: number, brand: string) {
    return getSocialImageContexts("og", lookup, page, limit, brand);
}
type SocialContextMap = { pinterest: PinContext; og: OgContext };
/** Authenticated preparation context; no artwork is exposed through the public DTO. */
async function getSocialImageContexts<K extends keyof SocialContextMap>(
    kind: K,
    lookup: PinLookup | null,
    page: number,
    limit: number,
    brand: string,
): Promise<{ items: SocialContextMap[K][]; total: number }> {
    const imageColumn = kind === "pinterest" ? "pinterestImage" : "ogImage";
    const columns: Record<string, string> = {
        id: "id",
        sha256: "sha256",
        sourceImageId: "sourceImageId",
        redbubbleId: "externalId",
    };
    const filters = Object.entries(lookup ?? {}).map(
        ([k, v]) => [columns[k], v] as const,
    );
    const read = async (
        field?: string,
        value?: unknown,
    ): Promise<Record<string, unknown>[]> => {
        if (getProvider() === "mysql") {
            const [rows] = await getMySQLPool().query<mysql.RowDataPacket[]>(
                `SELECT id, sha256, sourceImageId, externalId, active, title, collection, props, ${imageColumn} FROM designs WHERE active = TRUE${field ? ` AND ${field} = ?` : ""} ORDER BY id LIMIT ? OFFSET ?`,
                field ? [value, 1, 0] : [limit, (page - 1) * limit],
            );
            return rows;
        }
        let query = getSupabase()
            .from("designs")
            .select(
                `id, sha256, sourceImageId, externalId, active, title, collection, props, ${imageColumn}`,
            )
            .eq("active", true)
            .order("id");
        if (field) query = query.eq(field, value as string | number).limit(1);
        else query = query.range((page - 1) * limit, page * limit - 1);
        const { data, error } = await query;
        if (error)
            throw new Error("Failed to read social image context", {
                cause: error,
            });
        return data ?? [];
    };
    let rows: Record<string, unknown>[];
    let total: number;
    if (filters.length) {
        const found = (
            await Promise.all(filters.map(([f, v]) => read(f, v)))
        ).flat();
        if (new Set(found.map((r) => r.id)).size > 1)
            throw new ListingsError(
                409,
                "CONFLICT",
                "Identifiers resolve to different designs",
            );
        rows = found.length ? [found[0]] : [];
        // A supplied identifier cannot contradict a populated identity on the resolved row.
        if (
            rows[0] &&
            filters.some(
                ([f, v]) =>
                    rows[0][f] != null && String(rows[0][f]) !== String(v),
            )
        )
            throw new ListingsError(409, "CONFLICT", "Identifier mismatch");
        total = rows.length;
    } else {
        rows = await read();
        if (getProvider() === "mysql") {
            const [count] = await getMySQLPool().query<mysql.RowDataPacket[]>(
                "SELECT COUNT(*) AS n FROM designs WHERE active = TRUE",
            );
            total = Number(count[0].n);
        } else {
            const r = await getSupabase()
                .from("designs")
                .select("id", { count: "exact", head: true })
                .eq("active", true);
            if (r.error)
                throw new Error("Failed to count social image contexts", {
                    cause: r.error,
                });
            total = r.count ?? 0;
        }
    }
    return {
        total,
        items: rows.map((r) => {
            const props = (
                typeof r.props === "string" ? JSON.parse(r.props) : r.props
            ) as Record<string, unknown> | null;
            const sources: PinContext["sources"] = {};
            for (const [role, key] of [
                ["tee", "mockup_tshirt"],
                ["hat", "mockup_hat"],
                ["mug", "mockup_mug"],
                ["mousepad", "mockup_mousepad"],
            ] as const) {
                const url = props?.[key];
                if (typeof url === "string" && isProductUrl(url))
                    sources[role] = url;
            }
            return {
                designId: String(r.id),
                sha256: r.sha256 as string | null,
                sourceImageId:
                    r.sourceImageId == null ? null : Number(r.sourceImageId),
                redbubbleId: r.externalId == null ? null : String(r.externalId),
                active: true,
                title: String(r.title),
                brand,
                sources,
                ...(kind === "pinterest"
                    ? {pinterestImage: normalizePinterestImage(r.pinterestImage)}
                    : {ogImage: normalizeOgImage(r.ogImage), category: normalizeCollection(r.collection) || "Original design"}),
            } as SocialContextMap[K];
        }),
    };
}

export async function setPinterestImage(
    write: PinWrite,
): Promise<PinWriteResult> {
    if (getProvider() === "mysql")
        return setPinterestImageMySQL(getMySQLPool(), write);
    const { data, error } = await getSupabase().rpc(
        "set_design_pinterest_image",
        { write },
    );
    if (error)
        throw new Error("Failed to save Pinterest image", { cause: error });
    return data as PinWriteResult;
}

export async function setOgImage(
    write: OgWrite,
): Promise<OgWriteResult> {
    if (getProvider() === "mysql")
        return setOgImageMySQL(getMySQLPool(), write);
    const { data, error } = await getSupabase().rpc(
        "set_design_og_image",
        { write },
    );
    if (error)
        throw new Error("Failed to save Og image", { cause: error });
    return data as OgWriteResult;
}

// The sync pipeline stores "no_collection" when a design has no collection;
// that sentinel is for query bookkeeping and must never reach the UI, which
// treats an empty collection as "no collection".
const NO_COLLECTION_SENTINEL = "no_collection";

function normalizeCollection(value: unknown): string {
    const collection = typeof value === "string" ? value.trim() : "";
    return collection && collection !== NO_COLLECTION_SENTINEL ? collection : "";
}

// `active` is NOT NULL DEFAULT true in the schema; rows predating the column (or test
// fixtures without it) read as published. MySQL delivers the boolean as 1/0.
function normalizeActive(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (value === null || value === undefined) return true;
    return Boolean(value);
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
        active: normalizeActive(row.active),
        cdnImage: normalizeCdnArtworkOptions(row.cdnImage),
        pinterestImage: normalizePinterestImage(row.pinterestImage),
        ogImage: normalizeOgImage(row.ogImage),
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
    const searchTerms = getSearchTerms(searchQuery);
    if (searchQuery.trim() && !searchTerms.length) return {designs: [], total: 0};

    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        // Search needs every matching candidate to rank before pagination.
        const start = searchTerms.length ? 0 : offset;
        const end = searchTerms.length ? 99 : offset + safeLimit - 1;
        const keywordFilters = keywords.map(k =>
            `keywords.ilike."%${k.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}%"`).join(",");
        const termFilters = searchTerms.map(term =>
            `or(title.ilike.%${term}%,keywords.ilike.%${term}%,description.ilike.%${term}%)`);
        if (keywords.length) termFilters.push(`or(${keywordFilters})`);
        const filters = searchTerms.length ? `and(${termFilters.join(",")})` : keywordFilters;

        const runLegacyQuery = async (from = start, to = end) => {
            let query = supabaseClient.from("designs").select("*", {count: "exact"}).eq("active", true);
            if (filters) query = query.or(filters);
            if (collection) {
                query = query.eq("collection", collection);
            }
            query = query.order("createdAt", { ascending: false }).order("id", { ascending: false });
            return query.range(from, to);
        };

        const runJoinQuery = async (from = start, to = end) => {
            let query = supabaseClient
                .from("designs")
                .select("*, design_collections!inner(collections!inner(title))", {count: "exact"})
                .eq("active", true);
            if (filters) query = query.or(filters);
            query = query.eq("design_collections.collections.title", collection);
            query = query.order("createdAt", { ascending: false }).order("id", { ascending: false });
            return query.range(from, to);
        };

        let runQuery = collection ? runJoinQuery : runLegacyQuery;
        let {data, error, count} = await runQuery();

        // Out-of-range page: re-run the same query kind with range(0, 0) to get
        // the real count, without treating it as a join-vs-legacy fallback signal.
        if (error?.code === "PGRST103") {
            ({count} = await runQuery(0, 0));
            return {designs: [], total: count || 0};
        }

        // Fall back to the legacy single-collection filter if the join errors
        // (tables not migrated yet) or matches nothing.
        if (collection && (error || !count)) {
            runQuery = runLegacyQuery;
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

        if (searchTerms.length) {
            const rows = data || [];
            while (rows.length < (count || 0)) {
                const batch = await runQuery(rows.length, rows.length + 99);
                if (batch.error) {
                    console.error("Error fetching search candidates:", batch.error);
                    return {designs: [], total: 0};
                }
                if (!batch.data?.length) break;
                rows.push(...batch.data);
            }
            const ranked = rankSearchDesigns(rows.map(mapSupabaseRowToDesign), searchTerms);
            return {designs: ranked.slice(offset, offset + safeLimit), total: ranked.length};
        }

        // Convert data to Design[] using appropriate type checking
        const designs: Design[] = (data || []).map(mapSupabaseRowToDesign);

        return {designs, total: count || 0};
    }

    const pool = getMySQLPool();

    const buildBase = (withCollectionJoin: boolean) => {
        let base = "FROM designs WHERE active = TRUE";
        const params: (string | number)[] = [];

        for (const term of searchTerms) {
            base += " AND (LOWER(COALESCE(title, '')) LIKE ? OR LOWER(COALESCE(keywords, '')) LIKE ? OR LOWER(COALESCE(description, '')) LIKE ?)";
            params.push(`%${term}%`, `%${term}%`, `%${term}%`);
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
            `SELECT * ${base} ORDER BY createdAt DESC, id DESC${searchTerms.length ? "" : " LIMIT ? OFFSET ?"}`,
            searchTerms.length ? params : [...params, safeLimit, offset],
        );
        if (searchTerms.length) return {rows, total: rows.length};
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
    if (searchTerms.length) {
        const ranked = rankSearchDesigns(designs, searchTerms);
        return {designs: ranked.slice(offset, offset + safeLimit), total: ranked.length};
    }

    return {designs, total: result.total};
}

// Public surfaces treat a deactivated design (`active = false`) as missing; the
// operational tooling (background service, curation) passes includeInactive.
async function getDesignBy(
    column: "id" | "slug",
    value: string,
    includeInactive = false,
): Promise<{ design: Design; relatedDesigns: Design[] } | null> {
    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        let query = supabaseClient.from("designs").select("*").eq(column, value);
        if (!includeInactive) query = query.eq("active", true);
        const {data: designData, error} = await query.single();

        if (error) {
            // PGRST116: .single() matched no rows — a genuine "not found"
            if (error.code === "PGRST116") return null;
            console.error("Error fetching design:", error);
            throw new Error("Failed to fetch design", {cause: error});
        }
        if (!designData) return null;

        // Convert to Design
        const design: Design = mapSupabaseRowToDesign(designData);

        const relatedDesigns = await fetchRelatedByCollection(supabaseClient, design.collection, design.id);

        return {design, relatedDesigns};
    }

    const pool = getMySQLPool();
    // column is one of the literal values above (never user input), so it's safe to interpolate.
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT * FROM designs WHERE ${column} = ?${includeInactive ? "" : " AND active = TRUE"} LIMIT 1`,
        [value],
    );

    if (!rows.length) {
        return null;
    }

    // Convert to Design
    const design: Design = mapRowToDesign(rows[0]);

    const relatedDesigns = await fetchRelatedByCollectionMySQL(pool, design.collection, design.id);

    return {design, relatedDesigns};
}

export async function getDesignById(
    id: string,
    includeInactive = false,
): Promise<{ design: Design; relatedDesigns: Design[] } | null> {
    return getDesignBy("id", id, includeInactive);
}

export async function getDesignBySlug(
    slug: string,
    includeInactive = false,
): Promise<{ design: Design; relatedDesigns: Design[] } | null> {
    return getDesignBy("slug", slug, includeInactive);
}

async function fetchRelatedByCollection(
    supabaseClient: ReturnType<typeof createClient>,
    collection: string,
    id: string,
): Promise<Design[]> {
    const memberships = await supabaseClient.from("design_collections").select("collectionId").eq("designId", id);
    if (!memberships.error && memberships.data?.length) {
        const {data, error} = await supabaseClient.from("designs")
            .select("*, design_collections!inner(collectionId)")
            .in("design_collections.collectionId", memberships.data.map(row => row.collectionId))
            .eq("active", true)
            .neq("id", id)
            .order("createdAt", {ascending: false}).order("id", {ascending: false}).limit(5);
        if (!error) return (data || []).map(mapSupabaseRowToDesign);
        console.error("Error fetching related collection memberships:", error);
    }
    if (!collection) return [];
    const {data: relatedData, error: relatedError} = await supabaseClient
        .from("designs")
        .select("*")
        .eq("collection", collection)
        .eq("active", true)
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
    try {
        const [memberships] = await pool.query<mysql.RowDataPacket[]>(
            "SELECT collectionId FROM design_collections WHERE designId = ?", [id],
        );
        if (memberships.length) {
            const [rows] = await pool.query<mysql.RowDataPacket[]>(
                "SELECT * FROM designs WHERE id <> ? AND active = TRUE AND EXISTS (SELECT 1 FROM design_collections dc WHERE dc.designId = designs.id AND dc.collectionId IN (?)) ORDER BY createdAt DESC, id DESC LIMIT 5",
                [id, memberships.map(row => row.collectionId)],
            );
            return rows.map(mapRowToDesign);
        }
    } catch (err) {
        console.error("Error fetching related collection memberships, falling back:", err);
    }
    if (!collection) return [];
    const [relatedRows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT * FROM designs WHERE collection = ? AND id <> ? AND active = TRUE LIMIT 5",
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
            .eq("active", true)
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
        "SELECT DISTINCT collection FROM designs WHERE active = TRUE AND collection IS NOT NULL AND collection != '' AND collection != 'no_collection' ORDER BY collection ASC",
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
        active: normalizeActive(item.active),
        cdnImage: normalizeCdnArtworkOptions(item.cdnImage),
        pinterestImage: normalizePinterestImage(item.pinterestImage),
        ogImage: normalizeOgImage(item.ogImage),
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
            let query = supabaseClient.from("designs").select("id").eq("active", true);
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
                .eq("active", true)
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

        const {data, error} = await supabaseClient.from("designs").select("*").eq("active", true).in("id", pickedIds);

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
            let base = "FROM designs WHERE active = TRUE";
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

/** Light single-design read that also sees deactivated rows — the active-flag service's ids mode. */
export async function getDesignActiveState(
    id: string,
): Promise<{ id: string; title: string; active: boolean } | null> {
    const provider = getProvider();
    if (provider === "supabase") {
        const {data, error} = await getSupabase()
            .from("designs")
            .select("id, title, active")
            .eq("id", id)
            .maybeSingle();

        if (error) {
            console.error("Error reading design active state:", error);
            throw new Error("Failed to read design active state", {cause: error});
        }
        return data
            ? {id: data.id as string, title: data.title as string, active: normalizeActive(data.active)}
            : null;
    }

    const pool = getMySQLPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT id, title, active FROM designs WHERE id = ?",
        [id],
    );
    return rows.length
        ? {id: rows[0].id as string, title: rows[0].title as string, active: normalizeActive(rows[0].active)}
        : null;
}

/** Every design's {id, title, active} for the active-flag service's `all` mode. Deliberately
 * unfiltered: `all:false` must still reach already-deactivated rows (and reactivation needs them). */
export async function fetchDesignActiveEntries(): Promise<{ id: string; title: string; active: boolean }[]> {
    const provider = getProvider();
    const entries: { id: string; title: string; active: boolean }[] = [];

    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
            const {data, error} = await supabaseClient
                .from("designs")
                .select("id, title, active")
                .order("createdAt", {ascending: false})
                .range(from, from + pageSize - 1);
            // PGRST103: the range starts past the last row — every entry is loaded.
            if (error?.code === "PGRST103") break;
            if (error) {
                console.error("Error listing design active states:", error);
                throw new Error("Failed to list design active states", {cause: error});
            }
            for (const row of data ?? []) {
                entries.push({id: row.id as string, title: row.title as string, active: normalizeActive(row.active)});
            }
            if (!data || data.length < pageSize) break;
        }
        return entries;
    }

    const pool = getMySQLPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT id, title, active FROM designs ORDER BY createdAt DESC, id DESC",
    );
    return rows.map(row => ({id: row.id as string, title: row.title as string, active: normalizeActive(row.active)}));
}

/** Column-scoped active-flag write (active + updatedAt only); the sync pipeline never touches it. */
export async function updateDesignActive(id: string, active: boolean): Promise<void> {
    const provider = getProvider();
    const now = new Date();

    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const {error} = await supabaseClient
            .from("designs")
            .update({active, updatedAt: now.toISOString()})
            .eq("id", id);

        if (error) {
            console.error("Error updating design active flag:", error);
            throw new Error("Failed to update design active flag", {cause: error});
        }
        return;
    }

    const pool = getMySQLPool();
    // A Date object here (not an ISO string with a trailing "Z") — mysql2 serializes it to
    // MySQL's own DATETIME format; a raw ISO string fails strict-mode TIMESTAMP parsing.
    await pool.query(
        "UPDATE designs SET active = ?, updatedAt = ? WHERE id = ?",
        [active, now, id],
    );
}

export async function fetchCollections(): Promise<string[]> {
    const provider = getProvider();
    if (provider === "supabase") {
        const supabaseClient = getSupabase();
        const {data, error} = await supabaseClient
            .from("collections")
            .select("title, design_collections(designs(active))")
            .order("title");

        if (error || !data || !data.length) {
            return fetchLegacyCollections(provider);
        }

        // Only themes that still have at least one active design (each join row embeds its design).
        const withActiveDesigns = data.filter(item =>
            ((item.design_collections ?? []) as unknown as {designs: {active: unknown} | null}[])
                .some(membership => membership.designs && normalizeActive(membership.designs.active)));
        return Array.from(new Set(withActiveDesigns.map(item => item.title as string).filter(Boolean)));
    }

    try {
        const pool = getMySQLPool();
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
            "SELECT title FROM collections c WHERE EXISTS (SELECT 1 FROM design_collections dc JOIN designs d ON d.id = dc.designId WHERE dc.collectionId = c.id AND d.active = TRUE) ORDER BY title",
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

/** `size` is the collection's design_collections membership count (absent on legacy installs). */
export type FeedCollection = { title: string; description: string; size?: number };
export type FeaturedCollection = CollectionPage & {total: number; designs: Design[]};

/** Only explicitly prepared, existing, nonempty themes are promoted/indexed. */
export async function fetchFeaturedCollections(value: SiteConfig["collectionPages"]): Promise<FeaturedCollection[]> {
    const pages = getCollectionPages(value);
    if (!pages.length) return [];
    const available = new Set((await fetchFeedCollections()).map(collection => collection.title));
    const results = await Promise.all(pages.filter(page => available.has(page.collection)).map(async page => {
        // Three designs ride along so index cards can preview the collection.
        const {designs, total} = await fetchDesigns(1, "", page.collection, 3);
        return {...page, total, designs};
    }));
    return results.filter(page => page.total > 0);
}

/** Gift pages with at least one nonempty section collection; counts are looked up once per collection. */
export async function fetchLiveGiftPages(value: SiteConfig["giftPages"]): Promise<GiftPage[]> {
    const pages = getGiftPages(value);
    const collections = [...new Set(pages.flatMap(page => page.sections.map(section => section.collection)))];
    const totals = new Map(await Promise.all(collections.map(async collection =>
        [collection, (await fetchDesigns(1, "", collection, 1)).total] as const)));
    return pages.filter(page => page.sections.some(section => (totals.get(section.collection) ?? 0) > 0));
}

/** Add reviewed themes without changing marketplace memberships or other props. */
export async function addCuratedCollections(id: string, titles: string[]): Promise<void> {
    titles = [...new Set(titles)];
    if (!titles.length) return;
    const now = new Date().toISOString();
    if (getProvider() === "supabase") {
        const client = getSupabase();
        const {data: row, error: readError} = await client.from("designs").select("id, props, collection").eq("id", id).single();
        if (readError) throw new Error("Failed to read design for curation", {cause: readError});
        const {data: collections, error: collectionError} = await client.from("collections").select("id, title").in("title", titles);
        if (collectionError) throw new Error("Failed to read curation collections", {cause: collectionError});
        if (new Set(collections?.map(item => item.title)).size !== titles.length) throw new Error("Unknown curation collection");
        const curated = [...new Set([...curatedCollectionTitles(row.props), ...titles])];
        const {error: writeError} = await client.from("designs").update({
            props: {...(row.props as Record<string, unknown> | null), curatedCollections: curated},
            collection: normalizeCollection(row.collection) || curated[0], updatedAt: now,
        }).eq("id", id);
        if (writeError) throw new Error("Failed to save curated collections", {cause: writeError});
        const {error: linkError} = await client.from("design_collections").upsert(
            (collections || []).map(collection => ({designId: id, collectionId: collection.id})),
            {onConflict: "designId,collectionId", ignoreDuplicates: true},
        );
        if (linkError) throw new Error("Failed to save curated membership links", {cause: linkError});
        return;
    }
    const pool = getMySQLPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT props, collection FROM designs WHERE id = ?", [id]);
    if (!rows.length) throw new Error("Design not found for curation");
    const [collections] = await pool.query<mysql.RowDataPacket[]>("SELECT id, title FROM collections WHERE title IN (?)", [titles]);
    if (new Set(collections.map(item => item.title)).size !== titles.length) throw new Error("Unknown curation collection");
    const props = typeof rows[0].props === "string" ? JSON.parse(rows[0].props) : rows[0].props;
    const curated = [...new Set([...curatedCollectionTitles(props), ...titles])];
    await pool.query("UPDATE designs SET props = ?, collection = ?, updatedAt = ? WHERE id = ?", [
        JSON.stringify({...props, curatedCollections: curated}), normalizeCollection(rows[0].collection) || curated[0],
        now.replace("T", " ").slice(0, 19), id,
    ]);
    await pool.query("INSERT IGNORE INTO design_collections (designId, collectionId) VALUES ?", [collections.map(collection => [id, collection.id])]);
}

/** Upsert one `studio` row (select, then update or insert) on either provider. */
export async function saveStudioValue(key: string, value: string): Promise<void> {
    if (getProvider() === "supabase") {
        const client = getSupabase();
        const {data, error} = await client.from("studio").select("id").eq("key", key);
        if (error) throw new Error(`Failed to read studio config ${key}`, {cause: error});
        // An RLS-denied write matches 0 rows without an error, so require returned rows.
        const result = data?.length
            ? await client.from("studio").update({value}).eq("key", key).select("id")
            : await client.from("studio").insert({key, value}).select("id");
        if (result.error) throw new Error(`Failed to save studio config ${key}`, {cause: result.error});
        if (!result.data?.length) throw new Error(`studio write affected no rows: ${key}`);
        return;
    }
    const pool = getMySQLPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT id FROM studio WHERE `key` = ?", [key]);
    if (rows.length) await pool.query("UPDATE studio SET value = ? WHERE `key` = ?", [value, key]);
    else await pool.query("INSERT INTO studio (`key`, value) VALUES (?, ?)", [key, value]);
}

export async function saveCollectionPages(pages: CollectionPage[]): Promise<void> {
    if (getCollectionPages(pages).length !== pages.length) throw new Error("Invalid collection pages");
    await saveStudioValue("collectionPages", JSON.stringify(pages));
}

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
            .select("title, description, design_collections(designs(active))")
            .order("title");

        if (error || !data || !data.length) {
            if (error) console.error("Error fetching feed collections:", error);
            const legacy = await fetchLegacyCollections(provider);
            return legacy.map(title => ({title, description: ""}));
        }

        return dedupeFeedCollections(data.map(row => ({
            title: row.title as string,
            description: (row.description as string | null) ?? "",
            // Membership count over active designs only, so a fully deactivated theme
            // drops out of the chips, the feed index, and the one-feed-per-design sizes.
            size: ((row.design_collections ?? []) as unknown as {designs: {active: unknown} | null}[])
                .filter(membership => membership.designs && normalizeActive(membership.designs.active)).length,
        })));
    }

    try {
        const pool = getMySQLPool();
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
            `SELECT c.title, c.description, COUNT(d.id) AS size FROM collections c
             LEFT JOIN design_collections dc ON dc.collectionId = c.id
             LEFT JOIN designs d ON d.id = dc.designId AND d.active = TRUE
             GROUP BY c.id, c.title, c.description ORDER BY c.title`,
        );

        if (!rows.length) {
            const legacy = await fetchLegacyCollections(provider);
            return legacy.map(title => ({title, description: ""}));
        }

        return dedupeFeedCollections(rows.map(row => ({
            title: row.title as string,
            description: (row.description as string | null) ?? "",
            size: Number(row.size),
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
 * must have a pin source — a Classic T-Shirt mockup (`props.mockup_tshirt`) or a pod-uploader
 * CDN image (`cdnImage`, whose share JPEG backs the pin) — plus a marketplace link, and must
 * not already be pinned through the API (a `design_social_posts` row with channel 'pinterest',
 * status 'published' — so RSS auto-publish and pod-uploader never pin the same design twice).
 * `earliestListingAt` maps design id → the earliest design_listings.publishedAt, used
 * as the feed's pubDate. Deactivated designs (`active = false`) never reach these queries;
 * for still-active ones, removal state is exactly the social-post row.
 *
 * One feed per design: Pinterest makes a separate Pin per feed item, so a design that
 * belongs to several collections is kept only in the feed chosen by
 * `pinterestFeedCollection` (its smallest feed-backed collection by catalog-wide
 * membership `size`, then its primary collection, then the first feed slug
 * alphabetically). `feedCollections` is the full list of collections that have a feed. This narrows feeds only; the website's collection pages are untouched. */
export async function fetchCollectionFeedDesigns(
    collectionTitle: string,
    limit: number,
    feedCollections: readonly FeedCollection[],
): Promise<FeedDesigns> {
    const safeLimit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 100));
    // Over-fetch so post-JSON checks (TeePublic link in props) can
    // only shrink the result, not displace older eligible designs.
    const fetchLimit = Math.min(safeLimit * 3, 300);

    const finalize = async (rows: Design[]): Promise<FeedDesigns> => {
        const unique = new Map(rows.map(design => [design.id, design]));
        const eligible = [...unique.values()]
            .filter(design => hasMarketplaceLink(design) && hasPinImage(design));
        const memberships = await fetchDesignMemberships(eligible);
        const sizes = new Map(feedCollections.flatMap(entry => entry.size === undefined ? [] : [[entry.title, entry.size] as const]));
        const owned = assignDesignsToFeeds(eligible, memberships, assignCollectionSlugs([...feedCollections]), sizes)
            .get(collectionTitle) ?? [];
        const designs = owned.slice(0, safeLimit);
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
                .eq("active", true)
                .eq("design_collections.collections.title", collectionTitle)
                // Feed pins need a pin source: a Classic T-Shirt mockup (props.mockup_tshirt)
                // or a pod-uploader CDN image (cdnImage, share JPEG).
                .or("props->>mockup_tshirt.not.is.null,cdnImage.not.is.null,pinterestImage.not.is.null")
                .order("createdAt", {ascending: false})
                .order("id", {ascending: false})
                .range(0, fetchLimit - 1);
            return {data: (data ?? null) as Record<string, unknown>[] | null, error};
        };

        const runLegacyQuery = async (): Promise<FeedQueryResult> => {
            const {data, error} = await supabaseClient
                .from("designs")
                .select("*")
                .eq("active", true)
                .eq("collection", collectionTitle)
                .or("props->>mockup_tshirt.not.is.null,cdnImage.not.is.null,pinterestImage.not.is.null")
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
             WHERE d.active = TRUE
               AND EXISTS (SELECT 1 FROM design_collections dc JOIN collections c ON c.id = dc.collectionId
                           WHERE dc.designId = d.id AND c.title = ?)
               AND (JSON_EXTRACT(d.props, '$.mockup_tshirt') IS NOT NULL OR d.cdnImage IS NOT NULL OR d.pinterestImage IS NOT NULL)
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

/** Designs of any of the given collections for a gift RSS feed: deduplicated by id, newest first,
 * with the same eligibility as the collection feeds (marketplace link, mockup or CDN image).
 * Deliberately skips the one-feed-per-design assignment: gift feeds overlap collection feeds. */
export async function fetchGiftFeedDesigns(collectionTitles: readonly string[], limit: number): Promise<FeedDesigns> {
    const titles = [...new Set(collectionTitles)];
    if (!titles.length) return {designs: [], earliestListingAt: {}};
    const safeLimit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 100));
    const fetchLimit = Math.min(safeLimit * 3, 300);

    const finalize = async (rows: Design[]): Promise<FeedDesigns> => {
        const designs = [...new Map(rows.map(design => [design.id, design])).values()]
            .filter(design => hasMarketplaceLink(design) && hasPinImage(design))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
            .slice(0, safeLimit);
        return {designs, earliestListingAt: await fetchEarliestListingAt(designs)};
    };

    if (getProvider() === "supabase") {
        const client = getSupabase();
        const run = async (legacy: boolean) => {
            const base = legacy
                ? client.from("designs").select("*").eq("active", true).in("collection", titles)
                : client.from("designs").select("*, design_collections!inner(collections!inner(title))")
                    .eq("active", true)
                    .in("design_collections.collections.title", titles);
            return base.or("props->>mockup_tshirt.not.is.null,cdnImage.not.is.null,pinterestImage.not.is.null")
                .order("createdAt", {ascending: false}).order("id", {ascending: false}).range(0, fetchLimit - 1);
        };
        const joined = await run(false);
        const response = joined.error || !joined.data?.length ? await run(true) : joined;
        if (response.error) {
            console.error("Error fetching gift feed designs:", response.error);
            return {designs: [], earliestListingAt: {}};
        }
        return finalize((response.data ?? []).map(row => mapSupabaseRowToDesign(row as Record<string, unknown>)));
    }

    try {
        const [rows] = await getMySQLPool().query<mysql.RowDataPacket[]>(
            `SELECT d.* FROM designs d
             WHERE d.active = TRUE
               AND EXISTS (SELECT 1 FROM design_collections dc JOIN collections c ON c.id = dc.collectionId
                           WHERE dc.designId = d.id AND c.title IN (?))
               AND (JSON_EXTRACT(d.props, '$.mockup_tshirt') IS NOT NULL OR d.cdnImage IS NOT NULL OR d.pinterestImage IS NOT NULL)
             ORDER BY d.createdAt DESC, d.id DESC LIMIT ?`,
            [titles, fetchLimit],
        );
        return finalize(rows.map(mapRowToDesign));
    } catch (err) {
        console.error("Error fetching gift feed designs:", err);
        return {designs: [], earliestListingAt: {}};
    }
}

// Collection titles per design, for the one-feed-per-design rule. Fail-safe: when the
// lookup fails, or a design has no join rows (legacy installs), its membership is just
// its primary `collection` label — a design is never placed in more feeds than it was.
async function fetchDesignMemberships(designs: Design[]): Promise<Map<string, string[]>> {
    const memberships = new Map<string, string[]>();
    if (!designs.length) return memberships;
    const ids = designs.map(design => design.id);
    const add = (designId: string, title: string | null | undefined) => {
        if (!title) return;
        const titles = memberships.get(designId);
        if (titles) titles.push(title);
        else memberships.set(designId, [title]);
    };
    try {
        if (getProvider() === "supabase") {
            const {data, error} = await getSupabase()
                .from("design_collections")
                .select("designId, collections(title)")
                .in("designId", ids);
            if (error) throw error;
            for (const row of (data ?? []) as unknown as {
                designId: string;
                collections: {title: string | null} | {title: string | null}[] | null;
            }[]) {
                const linked = Array.isArray(row.collections) ? row.collections : [row.collections];
                for (const collection of linked) add(row.designId, collection?.title);
            }
        } else {
            const [rows] = await getMySQLPool().query<mysql.RowDataPacket[]>(
                `SELECT dc.designId, c.title FROM design_collections dc
                 JOIN collections c ON c.id = dc.collectionId
                 WHERE dc.designId IN (?)`,
                [ids],
            );
            for (const row of rows) add(row.designId as string, row.title as string | null);
        }
    } catch (err) {
        console.error("Error fetching collection memberships for feed:", err);
        memberships.clear();
    }
    for (const design of designs) {
        if (!memberships.has(design.id) && design.collection) memberships.set(design.id, [design.collection]);
    }
    return memberships;
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

// Hard-deletes a mark recorded by mistake; null when nothing matched.
export async function deleteSocialPost(target: SocialPostTarget): Promise<SocialPost | null> {
    if (getProvider() === "mysql") return deleteSocialPostMySQL(getMySQLPool(), target);
    const result = await socialRpc<{post: SocialPost | null}>("delete_design_social_post", {identity: target});
    return result.post && normalizeSocialPost(result.post);
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
            .select("id, slug, title, externalId, sha256, sourceImageId, cdnImage").eq(field, value).maybeSingle();
        if (error) throw new Error("Failed to look up design", {cause: error});
        if (!design) return null;
        const response = {...design, cdnImage: normalizeCdnImageMockups(design.cdnImage)} as IngestDesign;
        const {data: listings, error: listingError} = await client.from("design_listings")
            .select("id, platform, account, externalId, url, title, tags, thumbnailUrl, publishedAt, extra")
            .eq("designId", design.id as string).order("createdAt").order("id");
        if (listingError) throw new Error("Failed to look up listings", {cause: listingError});
        return {design: response, listings: listings as DesignListing[]};
    }
    const pool = getMySQLPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(`SELECT * FROM designs WHERE ${field} = ?`, [value]);
    if (!rows.length) return null;
    const [listings] = await pool.query<mysql.RowDataPacket[]>("SELECT * FROM design_listings WHERE designId = ? ORDER BY createdAt, id", [rows[0].id]);
    return {design: ingestDesignResponse(rows[0] as mysql.RowDataPacket & IngestDesign), listings: listings.map(mysqlListingResponse)};
}

/** PUT /api/v1/designs/cdn-image: overwrite designs.cdnImage for a batch; one result per item. */
export async function setDesignCdnImage(items: CdnImageItem[]): Promise<CdnImageResult[]> {
    if (getProvider() === "mysql") return setDesignCdnImageMySQL(getMySQLPool(), items);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new ListingsError(503, "NOT_CONFIGURED", "SUPABASE_SERVICE_ROLE_KEY is required for the cdn-image API");
    }
    const {data, error} = await getSupabase().rpc("set_design_cdn_image", {items});
    if (error) throw new Error("Failed to set design cdnImage", {cause: error});
    return data as CdnImageResult[];
}

/** Read-back for pod-uploader: the stored mockup array of the design a lookup resolves to. */
export async function getDesignCdnImage(lookup: CdnImageLookup): Promise<{designId: string; cdnImage: CdnImage | null} | null> {
    if (getProvider() === "mysql") return getDesignCdnImageMySQL(getMySQLPool(), lookup);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new ListingsError(503, "NOT_CONFIGURED", "SUPABASE_SERVICE_ROLE_KEY is required for the cdn-image API");
    }
    const column = "sha256" in lookup ? "sha256" : "sourceImageId" in lookup ? "sourceImageId" : "externalId";
    const {data, error} = await getSupabase().from("designs")
        .select("id, cdnImage").eq(column, Object.values(lookup)[0]).maybeSingle();
    if (error) throw new Error("Failed to look up design cdnImage", {cause: error});
    if (!data) return null;
    return {designId: data.id as string, cdnImage: normalizeCdnImageMockups(data.cdnImage)};
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

/** The stored listing URL for one design and platform — the detail page's and the Pinterest
 * landing's "Buy on Tostadora" button (whose URL lives only in design_listings, not in
 * designs.externalLink or props). Null when the design has no listing there. */
export async function fetchDesignListingUrl(designId: string, platform: ListingPlatform): Promise<string | null> {
    if (getProvider() === "supabase") {
        const {data, error} = await getSupabase()
            .from("design_listings")
            .select("url")
            .eq("designId", designId)
            .eq("platform", platform)
            .limit(1)
            .maybeSingle();
        if (error) {
            console.error("Error fetching design listing URL:", error);
            return null;
        }
        return (data?.url as string | undefined) ?? null;
    }
    const pool = getMySQLPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT url FROM design_listings WHERE designId = ? AND platform = ? LIMIT 1",
        [designId, platform],
    );
    return (rows[0]?.url as string | undefined) ?? null;
}
