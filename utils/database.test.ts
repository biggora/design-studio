import {describe, it, expect, beforeEach, vi} from "vitest";

vi.mock("next/cache", () => ({unstable_cache: (fn: unknown) => fn}));

type DesignsQueryResponse = { data: unknown; error: unknown; count: number | null };

let studioResponse: { data: unknown; error: unknown } = {data: [], error: null};
let designResponse: { data: unknown; error: unknown } = {data: null, error: null};
let relatedResponse: { data: unknown; error: unknown } = {data: [], error: null};
// A queue of responses consumed in order across successive `.range()` calls
// (e.g. the initial call, then a PGRST103 count-only re-run). A single
// non-array value is reused for every call.
let designsQueryResponse: DesignsQueryResponse | DesignsQueryResponse[] = {data: [], error: null, count: 0};
let legacyDesignsQueryResponse: DesignsQueryResponse | DesignsQueryResponse[] = {data: [], error: null, count: 0};
let legacyCollectionsResponse: { data: unknown; error: unknown } = {data: [], error: null};
let collectionsTableResponse: { data: unknown; error: unknown } = {data: [], error: null};

// A thenable chain that mimics the legacy `.not().neq().neq()` filter chain
// used by fetchCollections' fallback path — it resolves directly on `await`.
function legacyChain(response: { data: unknown; error: unknown }) {
    const obj = {
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve(response).then(resolve, reject),
        not: () => obj,
        neq: () => obj,
    };
    return obj;
}

const orderCalls: unknown[][] = [];
const rangeCalls: unknown[][] = [];
const neqCalls: unknown[][] = [];

function nextResponse(response: DesignsQueryResponse | DesignsQueryResponse[]): DesignsQueryResponse {
    if (Array.isArray(response)) {
        return response.length > 1 ? (response.shift() as DesignsQueryResponse) : response[0];
    }
    return response;
}

function makeDesignsBuilder(selectArg: string, options?: { count?: string }) {
    const hasCount = Boolean(options && options.count);
    const isJoin = selectArg.includes("design_collections");

    const builder = {
        ilike: () => builder,
        eq: (column: string) => {
            if (!hasCount && (column === "id" || column === "slug")) {
                return {single: () => Promise.resolve(designResponse)};
            }
            if (!hasCount) {
                // related-designs lookup: eq("collection", ...).neq("id", ...).limit(5)
                return {
                    neq: (...args: unknown[]) => {
                        neqCalls.push(args);
                        return {limit: () => Promise.resolve(relatedResponse)};
                    },
                };
            }
            return builder;
        },
        order: (...args: unknown[]) => {
            orderCalls.push(args);
            return builder;
        },
        range: (from: number, to: number) => {
            rangeCalls.push([from, to]);
            return Promise.resolve(nextResponse(isJoin ? designsQueryResponse : legacyDesignsQueryResponse));
        },
    };
    return builder;
}

vi.mock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({
        from: (table: string) => {
            if (table === "studio") {
                return {
                    select: () => ({
                        returns: () => Promise.resolve(studioResponse),
                    }),
                };
            }

            if (table === "collections") {
                return {
                    select: () => ({
                        order: () => Promise.resolve(collectionsTableResponse),
                    }),
                };
            }

            // table === "designs"
            return {
                select: (selectArg: string, options?: { count?: string }) => {
                    if (!options && selectArg === "collection") {
                        // legacy fetchCollections chain
                        return legacyChain(legacyCollectionsResponse);
                    }
                    return makeDesignsBuilder(selectArg, options);
                },
            };
        },
    })),
}));

const mysqlQuery = vi.fn();

vi.mock("mysql2/promise", () => ({
    default: {
        createPool: vi.fn(() => ({
            query: (...args: unknown[]) => mysqlQuery(...args),
        })),
    },
}));

function stubMySQLEnv() {
    vi.stubEnv("DATABASE_PROVIDER", "mysql");
    vi.stubEnv("MYSQL_HOST", "localhost");
    vi.stubEnv("MYSQL_USER", "user");
    vi.stubEnv("MYSQL_PASSWORD", "pass");
    vi.stubEnv("MYSQL_DATABASE", "db");
}

describe("utils/database", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
        vi.stubEnv("DATABASE_PROVIDER", "supabase");
        vi.spyOn(console, "error").mockImplementation(() => {});
        studioResponse = {data: [], error: null};
        designResponse = {data: null, error: null};
        relatedResponse = {data: [], error: null};
        designsQueryResponse = {data: [], error: null, count: 0};
        legacyDesignsQueryResponse = {data: [], error: null, count: 0};
        legacyCollectionsResponse = {data: [], error: null};
        collectionsTableResponse = {data: [], error: null};
        mysqlQuery.mockReset();
        orderCalls.length = 0;
        rangeCalls.length = 0;
        neqCalls.length = 0;
    });

    describe("getSiteConfig", () => {
        it("returns config built from rows on success", async () => {
            studioResponse = {
                data: [{id: 1, key: "name", value: "Acme", createdAt: ""}],
                error: null,
            };
            const {getSiteConfig} = await import("@/utils/database");
            const config = await getSiteConfig();
            expect(config.name).toBe("Acme");
        });

        it("throws when there is an error and no prior success", async () => {
            studioResponse = {data: null, error: {code: "08006", message: "connection failed"}};
            const {getSiteConfig} = await import("@/utils/database");
            await expect(getSiteConfig()).rejects.toThrow("Failed to load site config");
        });

        it("returns the last-known-good config when a later call fails", async () => {
            const {getSiteConfig} = await import("@/utils/database");

            studioResponse = {
                data: [{id: 1, key: "name", value: "Acme", createdAt: ""}],
                error: null,
            };
            const first = await getSiteConfig();
            expect(first.name).toBe("Acme");

            studioResponse = {data: null, error: {code: "08006", message: "connection failed"}};
            const second = await getSiteConfig();
            expect(second.name).toBe("Acme");
        });

        it("returns defaults when the table is empty and there is no error", async () => {
            studioResponse = {data: [], error: null};
            const {getSiteConfig} = await import("@/utils/database");
            const config = await getSiteConfig();
            expect(config.name).toBe("Design Studio");
        });
    });

    describe("getDesignById", () => {
        it("returns null when no rows are found (PGRST116)", async () => {
            designResponse = {data: null, error: {code: "PGRST116", message: "no rows"}};
            const {getDesignById} = await import("@/utils/database");
            const result = await getDesignById("missing-id");
            expect(result).toBeNull();
        });

        it("throws on other errors instead of returning null", async () => {
            designResponse = {data: null, error: {code: "08006", message: "connection failed"}};
            const {getDesignById} = await import("@/utils/database");
            await expect(getDesignById("some-id")).rejects.toThrow("Failed to fetch design");
        });
    });

    describe("getDesignBySlug (supabase)", () => {
        const designRow = {
            id: "design-1",
            externalId: 1,
            title: "Fox",
            slug: "fox",
            externalLink: "https://example.com/1",
            externalImageUrl: "https://example.com/1.png",
            category: "cat",
            collection: "Nature",
            imageName: "fox.png",
            description: "desc",
            keywords: "kw",
            backgroundColors: "bg",
            backgroundColor: "white",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-02T00:00:00.000Z",
            shared: true,
        };

        it("returns the mapped design including slug", async () => {
            designResponse = {data: designRow, error: null};
            const {getDesignBySlug} = await import("@/utils/database");
            const result = await getDesignBySlug("fox");
            expect(result?.design.slug).toBe("fox");
            expect(result?.design.id).toBe("design-1");
        });

        it("returns null when no rows are found (PGRST116)", async () => {
            designResponse = {data: null, error: {code: "PGRST116", message: "no rows"}};
            const {getDesignBySlug} = await import("@/utils/database");
            const result = await getDesignBySlug("missing-slug");
            expect(result).toBeNull();
        });

        it("throws on other errors instead of returning null", async () => {
            designResponse = {data: null, error: {code: "08006", message: "connection failed"}};
            const {getDesignBySlug} = await import("@/utils/database");
            await expect(getDesignBySlug("fox")).rejects.toThrow("Failed to fetch design");
        });

        it("excludes the loaded design's id (not the slug) from the related-designs lookup", async () => {
            designResponse = {data: designRow, error: null};
            relatedResponse = {data: [], error: null};
            const {getDesignBySlug} = await import("@/utils/database");
            await getDesignBySlug("fox");
            expect(neqCalls[0]).toEqual(["id", "design-1"]);
        });
    });

    describe("getDesignBySlug (mysql)", () => {
        it("queries by slug with LIMIT 1", async () => {
            stubMySQLEnv();
            mysqlQuery.mockImplementation((sql: string) => {
                if (sql === "SELECT * FROM designs WHERE slug = ? LIMIT 1") {
                    return Promise.resolve([[]]);
                }
                return Promise.resolve([[]]);
            });
            const {getDesignBySlug} = await import("@/utils/database");
            const result = await getDesignBySlug("my-slug");
            expect(mysqlQuery).toHaveBeenCalledWith(
                "SELECT * FROM designs WHERE slug = ? LIMIT 1",
                ["my-slug"],
            );
            expect(result).toBeNull();
        });
    });

    describe("fetchDesigns (supabase)", () => {
        const joinRow = {
            id: "1",
            externalId: 1,
            title: "Fox",
            slug: "fox",
            externalLink: "https://example.com/1",
            externalImageUrl: "https://example.com/1.png",
            category: "cat",
            collection: "legacy-collection",
            imageName: "fox.png",
            description: "desc",
            keywords: "kw",
            backgroundColors: "bg",
            backgroundColor: "white",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-02T00:00:00.000Z",
            dimensions: undefined,
            material: undefined,
            price: undefined,
            inStock: undefined,
            shared: true,
            props: undefined,
            design_collections: [{collections: {title: "Nature"}}],
        };

        it("uses the join path and strips the embedded design_collections key", async () => {
            designsQueryResponse = {data: [joinRow], error: null, count: 1};
            const {fetchDesigns} = await import("@/utils/database");
            const {designs, total} = await fetchDesigns(1, "", "Nature", 12);

            expect(total).toBe(1);
            expect(designs).toHaveLength(1);
            expect(designs[0]).not.toHaveProperty("design_collections");
            expect(designs[0].id).toBe("1");
            expect(designs[0].title).toBe("Fox");
            expect(designs[0].slug).toBe("fox");
        });

        it("falls back to the legacy filter when the join query errors", async () => {
            designsQueryResponse = {data: null, error: {code: "42P01", message: "missing table"}, count: null};
            legacyDesignsQueryResponse = {data: [{...joinRow, design_collections: undefined}], error: null, count: 1};

            const {fetchDesigns} = await import("@/utils/database");
            const {designs, total} = await fetchDesigns(1, "", "legacy-collection", 12);

            expect(total).toBe(1);
            expect(designs).toHaveLength(1);
            expect(designs[0].id).toBe("1");
        });

        it("falls back to the legacy filter when the join query returns zero results", async () => {
            designsQueryResponse = {data: [], error: null, count: 0};
            legacyDesignsQueryResponse = {data: [{...joinRow, design_collections: undefined}], error: null, count: 1};

            const {fetchDesigns} = await import("@/utils/database");
            const {designs, total} = await fetchDesigns(1, "", "legacy-collection", 12);

            expect(total).toBe(1);
            expect(designs).toHaveLength(1);
        });

        it("does not touch the query shape when no collection is given", async () => {
            legacyDesignsQueryResponse = {data: [{...joinRow, design_collections: undefined}], error: null, count: 1};
            const {fetchDesigns} = await import("@/utils/database");
            const {designs, total} = await fetchDesigns(1, "", "", 12);

            expect(total).toBe(1);
            expect(designs).toHaveLength(1);
        });

        it("returns the real total (not 0) when the requested page is past the end (PGRST103)", async () => {
            legacyDesignsQueryResponse = [
                {data: null, error: {code: "PGRST103", message: "offset out of range"}, count: null},
                {data: [], error: null, count: 224},
            ];

            const {fetchDesigns} = await import("@/utils/database");
            const {designs, total} = await fetchDesigns(99, "", "", 12);

            expect(designs).toEqual([]);
            expect(total).toBe(224);
            expect(rangeCalls[rangeCalls.length - 1]).toEqual([0, 0]);
            expect(console.error).not.toHaveBeenCalled();
        });

        it("orders by id as a tiebreaker after createdAt to keep pagination stable", async () => {
            legacyDesignsQueryResponse = {data: [{...joinRow, design_collections: undefined}], error: null, count: 1};
            const {fetchDesigns} = await import("@/utils/database");
            await fetchDesigns(1, "", "", 12);

            expect(orderCalls).toEqual([
                ["createdAt", {ascending: false}],
                ["id", {ascending: false}],
            ]);
        });
    });

    describe("fetchCollections (supabase)", () => {
        it("returns titles from the collections table", async () => {
            collectionsTableResponse = {data: [{title: "Nature"}, {title: "Space"}], error: null};
            const {fetchCollections} = await import("@/utils/database");
            const result = await fetchCollections();
            expect(result).toEqual(["Nature", "Space"]);
        });

        it("falls back to legacy designs.collection when the table query errors", async () => {
            collectionsTableResponse = {data: null, error: {code: "42P01", message: "missing table"}};
            legacyCollectionsResponse = {data: [{collection: "Legacy"}], error: null};
            const {fetchCollections} = await import("@/utils/database");
            const result = await fetchCollections();
            expect(result).toEqual(["Legacy"]);
        });

        it("falls back to legacy designs.collection when the table is empty", async () => {
            collectionsTableResponse = {data: [], error: null};
            legacyCollectionsResponse = {data: [{collection: "Legacy"}], error: null};
            const {fetchCollections} = await import("@/utils/database");
            const result = await fetchCollections();
            expect(result).toEqual(["Legacy"]);
        });
    });

    describe("fetchDesigns (mysql)", () => {
        const row = {
            id: "1",
            externalId: 1,
            title: "Fox",
            slug: "fox",
            externalLink: "https://example.com/1",
            externalImageUrl: "https://example.com/1.png",
            category: "cat",
            collection: "legacy-collection",
            imageName: "fox.png",
            description: "desc",
            keywords: "kw",
            backgroundColors: "bg",
            backgroundColor: "white",
            createdAt: "2024-01-01 00:00:00",
            updatedAt: "2024-01-02 00:00:00",
            shared: 1,
        };

        it("uses the collection join EXISTS clause", async () => {
            stubMySQLEnv();
            mysqlQuery.mockImplementation((sql: string) => {
                if (sql.startsWith("SELECT * FROM designs") || sql.includes("SELECT *")) {
                    expect(sql).toContain("EXISTS (SELECT 1 FROM design_collections");
                    return Promise.resolve([[row]]);
                }
                if (sql.startsWith("SELECT COUNT")) {
                    expect(sql).toContain("EXISTS (SELECT 1 FROM design_collections");
                    return Promise.resolve([[{total: 1}]]);
                }
                return Promise.resolve([[]]);
            });

            const {fetchDesigns} = await import("@/utils/database");
            const {designs, total} = await fetchDesigns(1, "", "Nature", 12);

            expect(total).toBe(1);
            expect(designs).toHaveLength(1);
            expect(designs[0].id).toBe("1");
            expect(designs[0].slug).toBe("fox");
        });

        it("falls back to the legacy filter when the join query throws", async () => {
            stubMySQLEnv();
            mysqlQuery.mockImplementation((sql: string) => {
                if (sql.includes("EXISTS")) {
                    return Promise.reject(new Error("table design_collections doesn't exist"));
                }
                if (sql.startsWith("SELECT * FROM designs")) {
                    return Promise.resolve([[row]]);
                }
                return Promise.resolve([[{total: 1}]]);
            });

            const {fetchDesigns} = await import("@/utils/database");
            const {designs, total} = await fetchDesigns(1, "", "legacy-collection", 12);

            expect(total).toBe(1);
            expect(designs).toHaveLength(1);
        });

        it("orders by id as a tiebreaker after createdAt to keep pagination stable", async () => {
            stubMySQLEnv();
            mysqlQuery.mockImplementation((sql: string) => {
                if (sql.startsWith("SELECT * FROM designs")) {
                    expect(sql).toContain("ORDER BY createdAt DESC, id DESC");
                    return Promise.resolve([[row]]);
                }
                return Promise.resolve([[{total: 1}]]);
            });

            const {fetchDesigns} = await import("@/utils/database");
            await fetchDesigns(1, "", "", 12);
        });
    });

    describe("fetchCollections (mysql)", () => {
        it("returns titles from the collections table", async () => {
            stubMySQLEnv();
            mysqlQuery.mockImplementation((sql: string) => {
                if (sql.includes("FROM collections")) {
                    return Promise.resolve([[{title: "Nature"}, {title: "Space"}]]);
                }
                return Promise.resolve([[]]);
            });

            const {fetchCollections} = await import("@/utils/database");
            const result = await fetchCollections();
            expect(result).toEqual(["Nature", "Space"]);
        });

        it("falls back to legacy designs.collection when the collections table is missing", async () => {
            stubMySQLEnv();
            mysqlQuery.mockImplementation((sql: string) => {
                if (sql.includes("FROM collections")) {
                    return Promise.reject(new Error("table collections doesn't exist"));
                }
                if (sql.includes("DISTINCT collection FROM designs")) {
                    return Promise.resolve([[{collection: "Legacy"}]]);
                }
                return Promise.resolve([[]]);
            });

            const {fetchCollections} = await import("@/utils/database");
            const result = await fetchCollections();
            expect(result).toEqual(["Legacy"]);
        });

        it("falls back to legacy designs.collection when the collections table is empty", async () => {
            stubMySQLEnv();
            mysqlQuery.mockImplementation((sql: string) => {
                if (sql.includes("FROM collections")) {
                    return Promise.resolve([[]]);
                }
                if (sql.includes("DISTINCT collection FROM designs")) {
                    return Promise.resolve([[{collection: "Legacy"}]]);
                }
                return Promise.resolve([[]]);
            });

            const {fetchCollections} = await import("@/utils/database");
            const result = await fetchCollections();
            expect(result).toEqual(["Legacy"]);
        });
    });
});
