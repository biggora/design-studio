import {describe, it, expect, beforeEach, vi} from "vitest";

vi.mock("next/cache", () => ({unstable_cache: (fn: unknown) => fn}));

let studioResponse: { data: unknown; error: unknown } = {data: [], error: null};
let designResponse: { data: unknown; error: unknown } = {data: null, error: null};
let relatedResponse: { data: unknown; error: unknown } = {data: [], error: null};

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

            // table === "designs"
            return {
                select: () => ({
                    eq: (column: string) => {
                        if (column === "id") {
                            return {single: () => Promise.resolve(designResponse)};
                        }
                        // collection filter for related designs
                        return {
                            neq: () => ({
                                limit: () => Promise.resolve(relatedResponse),
                            }),
                        };
                    },
                }),
            };
        },
    })),
}));

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
});
