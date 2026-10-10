import {beforeEach, describe, expect, it, vi} from "vitest";
import catPrints from "@/lib/__fixtures__/cat-lover-gift.json";

vi.mock("next/cache", () => ({unstable_cache: (fn: unknown) => fn}));

let rows: Record<string, unknown>[];
let joinFails: boolean;
let failSecondBatch: boolean;
const filters: string[] = [];
const ranges: number[][] = [];
const selections: string[] = [];
const mysqlQuery = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
    createClient: () => ({
        from: () => ({
            select: (selection: string) => {
                selections.push(selection);
                let titleQuery = "";
                const builder = {
                    ilike: (_column: string, pattern: string) => {titleQuery = pattern.slice(1, -1); return builder;},
                    or: (filter: string) => {filters.push(filter); return builder;},
                    eq: () => builder,
                    order: () => builder,
                    range: async (from: number, to: number) => {
                        ranges.push([from, to]);
                        if ((joinFails && selection.includes("design_collections")) || (failSecondBatch && from > 0)) {
                            return {data: null, count: null, error: {message: "query failed"}};
                        }
                        const matches = titleQuery
                            ? rows.filter(row => String(row.title).toLowerCase().includes(titleQuery)) : rows;
                        return {data: matches.slice(from, to + 1), count: matches.length, error: null};
                    },
                };
                return builder;
            },
        }),
    }),
}));

vi.mock("mysql2/promise", () => ({default: {createPool: () => ({query: mysqlQuery})}}));

beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_PROVIDER", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    rows = catPrints.map(row => ({...row, createdAt: "2026-10-09T00:00:00Z"}));
    joinFails = false;
    failSecondBatch = false;
    filters.length = 0;
    ranges.length = 0;
    selections.length = 0;
    mysqlQuery.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Supabase catalog search", () => {
    it("finds all eight real cat lover gift prints, including titles without cat", async () => {
        const {fetchDesigns} = await import("@/utils/database");
        const result = await fetchDesigns(1, "cat lover gift", "", 100);
        expect(result.total).toBe(8);
        expect(result.designs.map(row => row.id).sort()).toEqual(catPrints.map(row => row.id).sort());
        expect(filters[0]).toContain("or(title.ilike.%cat%,keywords.ilike.%cat%,description.ilike.%cat%)");
        expect(filters[0]).toContain("or(title.ilike.%lover%,keywords.ilike.%lover%,description.ilike.%lover%)");
        expect(filters[0]).toContain("or(title.ilike.%gift%,keywords.ilike.%gift%,description.ilike.%gift%)");
    });

    it("ranks every batch before paging, with accurate totals beyond page one", async () => {
        rows = Array.from({length: 101}, (_, i) => ({id: String(i), title: "Art", keywords: "", description: "cat"}));
        rows.push({id: "best", title: "Cat", keywords: "", description: ""});
        const {fetchDesigns} = await import("@/utils/database");
        const first = await fetchDesigns(1, "cat", "", 2);
        expect(first.designs.map(row => row.id)).toEqual(["best", "0"]);
        expect(first.total).toBe(102);
        expect(ranges).toEqual([[0, 99], [100, 199]]);
        const second = await fetchDesigns(2, "cat", "", 2);
        expect(second.designs.map(row => row.id)).toEqual(["1", "2"]);
        expect(second.total).toBe(102);
        expect(await fetchDesigns(99, "cat", "", 2)).toEqual({designs: [], total: 102});
    });

    it("keeps the keywords filter in the same AND expression as search terms", async () => {
        const {fetchDesigns} = await import("@/utils/database");
        await fetchDesigns(1, "cat gift", "Pets", 15, ["pixel art"]);
        expect(selections[0]).toContain("design_collections!inner");
        expect(filters).toHaveLength(1);
        expect(filters[0]).toContain("or(keywords.ilike.\"%pixel art%\")");
        expect(filters[0]).toMatch(/^and\(/);
    });

    it("retains search and ranking when falling back to legacy collection filtering", async () => {
        joinFails = true;
        const {fetchDesigns} = await import("@/utils/database");
        const result = await fetchDesigns(1, "gift cat lover", "Pets", 100);
        expect(result.total).toBe(8);
        expect(selections).toHaveLength(2);
        expect(filters[0]).toEqual(filters[1]);
    });

    it("does not return a partially ranked page when a later batch fails", async () => {
        failSecondBatch = true;
        rows = Array.from({length: 101}, (_, i) => ({id: String(i), title: "cat", keywords: "", description: ""}));
        const {fetchDesigns} = await import("@/utils/database");
        expect(await fetchDesigns(1, "cat", "", 15)).toEqual({designs: [], total: 0});
        expect(console.error).toHaveBeenCalled();
    });

    it("rejects punctuation-only searches without querying the whole catalog", async () => {
        const {fetchDesigns} = await import("@/utils/database");
        expect(await fetchDesigns(1, "%_(),\\\"", "", 15)).toEqual({designs: [], total: 0});
        expect(selections).toEqual([]);
    });
});

describe("MySQL catalog search", () => {
    beforeEach(() => {
        vi.stubEnv("DATABASE_PROVIDER", "mysql");
        vi.stubEnv("MYSQL_HOST", "localhost");
        vi.stubEnv("MYSQL_USER", "user");
        vi.stubEnv("MYSQL_PASSWORD", "pass");
        vi.stubEnv("MYSQL_DATABASE", "db");
        mysqlQuery.mockImplementation(() => Promise.resolve([rows]));
    });

    it("finds and ranks all eight prints with parameterized all-field predicates", async () => {
        const {fetchDesigns} = await import("@/utils/database");
        const result = await fetchDesigns(1, "  CAT lover gift CAT ", "", 100);
        expect(result.total).toBe(8);
        expect(result.designs.map(row => row.id).sort()).toEqual(catPrints.map(row => row.id).sort());
        const [sql, params] = mysqlQuery.mock.calls[0];
        expect(sql).toContain("LOWER(COALESCE(title, '')) LIKE ?");
        expect(sql).toContain("LOWER(COALESCE(keywords, '')) LIKE ?");
        expect(sql).toContain("LOWER(COALESCE(description, '')) LIKE ?");
        expect(params).toEqual(["%cat%", "%cat%", "%cat%", "%lover%", "%lover%", "%lover%", "%gift%", "%gift%", "%gift%"]);
        expect(sql).not.toContain("LIMIT");
    });

    it("ranks before paging while retaining collection and keywords predicates", async () => {
        rows = [
            {id: "weak", title: "Art", keywords: "pixel art", description: "cat gift"},
            {id: "best", title: "Cat Gift", keywords: "pixel art", description: ""},
        ];
        const {fetchDesigns} = await import("@/utils/database");
        const result = await fetchDesigns(2, "cat gift", "Pets", 1, ["pixel art"]);
        expect(result.designs.map(row => row.id)).toEqual(["weak"]);
        expect(result.total).toBe(2);
        const [sql, params] = mysqlQuery.mock.calls[0];
        expect(sql).toContain("EXISTS (SELECT 1 FROM design_collections");
        expect(params.slice(-3)).toEqual(["Pets", "Pets", "%pixel art%"]);
    });
});
