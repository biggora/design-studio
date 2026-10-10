import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("next/cache", () => ({unstable_cache: (fn: unknown) => fn}));
let row: Record<string, unknown>;
let memberships: {collectionId: string}[];
let collections: {id: string; title: string; description: string}[];
let writes: {table: string; value: unknown}[];
const filters: unknown[][] = [];
const mysqlQuery = vi.fn();

vi.mock("@supabase/supabase-js", () => ({createClient: () => ({from: (table: string) => {
    const writer = (value: unknown) => {
        writes.push({table, value});
        return {eq: async () => ({error: null}), then: (resolve: (result: unknown) => unknown) => Promise.resolve({error: null}).then(resolve)};
    };
    return {update: writer, upsert: writer, insert: writer, select: (selection: string) => {
        let collection = "";
        const result = () => ({error: null, data: table === "design_collections" ? memberships
            : table === "collections" ? collections
            : table === "studio" ? [] : [{id: "related", title: "Cat", collection: "Other"}]});
        const builder = {
            eq: (column: string, value: unknown) => {if (column.includes("title") || column === "collection") collection = String(value); return builder;},
            in: (...args: unknown[]) => {filters.push(args); return builder;},
            neq: (...args: unknown[]) => {filters.push(args); return builder;},
            order: () => builder,
            single: async () => ({data: row, error: null}),
            limit: async () => result(),
            range: async () => ({data: [{...row, design_collections: []}], count: collection === "Empty" ? 0 : 2, error: null}),
            then: (resolve: (result: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        };
        void selection;
        return builder;
    }};
}})}));
vi.mock("mysql2/promise", () => ({default: {createPool: () => ({query: mysqlQuery})}}));

beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_PROVIDER", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    row = {id: "current", title: "Cat", collection: "no_collection", props: {mockup_tshirt: "mockup", teepublicLink: "keep"}};
    memberships = [{collectionId: "pets"}, {collectionId: "coding"}];
    collections = [{id: "pets", title: "Pets", description: "Pet artwork"}];
    writes = [];
    filters.length = 0;
    mysqlQuery.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("collection database behavior", () => {
    it("finds recommendations through all memberships even without a primary collection", async () => {
        const {getDesignBySlug} = await import("@/utils/database");
        const result = await getDesignBySlug("cat");
        expect(result?.relatedDesigns.map(design => design.id)).toEqual(["related"]);
        expect(filters).toContainEqual(["design_collections.collectionId", ["pets", "coding"]]);
        expect(filters).toContainEqual(["id", "current"]);
    });

    it("does not suggest uncollected rows when the current design has no memberships", async () => {
        memberships = [];
        const {getDesignBySlug} = await import("@/utils/database");
        expect((await getDesignBySlug("cat"))?.relatedDesigns).toEqual([]);
    });

    it("adds curation while preserving props and an existing primary theme", async () => {
        row.collection = "Programming";
        row.props = {...row.props as object, curatedCollections: ["Programming"]};
        const {addCuratedCollections} = await import("@/utils/database");
        await addCuratedCollections("current", ["Pets", "Pets"]);
        expect(writes[0]).toMatchObject({table: "designs", value: {
            collection: "Programming", props: {mockup_tshirt: "mockup", teepublicLink: "keep", curatedCollections: ["Programming", "Pets"]},
        }});
        expect(writes[1]).toEqual({table: "design_collections", value: [{designId: "current", collectionId: "pets"}]});
    });

    it("rejects unknown collections before making any writes", async () => {
        collections = [];
        const {addCuratedCollections} = await import("@/utils/database");
        await expect(addCuratedCollections("current", ["Unknown"])).rejects.toThrow("Unknown curation collection");
        expect(writes).toEqual([]);
    });

    it("promotes only configured, existing, nonempty collections", async () => {
        collections.push({id: "empty", title: "Empty", description: "Empty"});
        const page = (collection: string) => ({collection, title: `${collection} prints`, description: "Pick a print.", intro: "Browse this theme."});
        const {fetchFeaturedCollections} = await import("@/utils/database");
        expect((await fetchFeaturedCollections(JSON.stringify([page("Pets"), page("Unknown"), page("Empty")]))).map(item => item.collection))
            .toEqual(["Pets"]);
    });

    it("stores prepared page copy in studio as JSON without requiring a new schema", async () => {
        const pages = [{collection: "Pets", title: "Pet prints", description: "Cat and dog prints.", intro: "Pick a pet design."}];
        const {saveCollectionPages} = await import("@/utils/database");
        await saveCollectionPages(pages);
        expect(writes).toEqual([{table: "studio", value: {key: "collectionPages", value: JSON.stringify(pages)}}]);
    });
});

describe("MySQL collection behavior", () => {
    beforeEach(() => {
        vi.stubEnv("DATABASE_PROVIDER", "mysql");
        for (const key of ["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"]) vi.stubEnv(key, "test");
        mysqlQuery.mockImplementation((sql: string) => {
            if (sql.includes("FROM collections")) return Promise.resolve([collections]);
            if (sql.startsWith("SELECT collectionId")) return Promise.resolve([memberships]);
            if (sql.startsWith("SELECT * FROM designs WHERE slug")) return Promise.resolve([[row]]);
            if (sql.startsWith("SELECT * FROM designs WHERE id <>")) return Promise.resolve([[{id: "related", title: "Cat"}]]);
            if (sql.startsWith("SELECT props")) return Promise.resolve([[row]]);
            return Promise.resolve([[]]);
        });
    });

    it("queries shared memberships, excludes self and limits related prints", async () => {
        const {getDesignBySlug} = await import("@/utils/database");
        expect((await getDesignBySlug("cat"))?.relatedDesigns.map(design => design.id)).toEqual(["related"]);
        const call = mysqlQuery.mock.calls.find(([sql]) => sql.startsWith("SELECT * FROM designs WHERE id <>"));
        expect(call?.[0]).toContain("LIMIT 5");
        expect(call?.[1]).toEqual(["current", ["pets", "coding"]]);
    });

    it("writes additive curation with bound parameters and preserved props", async () => {
        const {addCuratedCollections} = await import("@/utils/database");
        await addCuratedCollections("current", ["Pets"]);
        const call = mysqlQuery.mock.calls.find(([sql]) => sql.startsWith("UPDATE designs"));
        expect(JSON.parse(call?.[1][0])).toEqual({mockup_tshirt: "mockup", teepublicLink: "keep", curatedCollections: ["Pets"]});
        expect(call?.[1][1]).toBe("Pets");
        expect(mysqlQuery.mock.calls.find(([sql]) => sql.startsWith("INSERT IGNORE"))?.[1])
            .toEqual([[["current", "pets"]]]);
    });
});
