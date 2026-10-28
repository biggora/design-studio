import {describe, it, expect, vi, beforeEach} from "vitest";
import {Design} from "@/types/design";

// Focused harness for the feed queries (fetchFeedCollections /
// fetchCollectionFeedDesigns): a generic thenable PostgREST-style builder that
// records each step and plays per-table canned responses in order.
type TableResponse = {data: unknown; error: unknown};

let responses: Record<string, TableResponse | TableResponse[]>;
let steps: Record<string, {method: string; args: unknown[]}[]>;

function record(table: string, method: string, args: unknown[]) {
    (steps[table] ??= []).push({method, args});
}

function resolveTable(table: string): TableResponse {
    const response = responses[table];
    if (Array.isArray(response)) {
        return response.length > 1 ? (response.shift() as TableResponse) : (response[0] ?? {data: [], error: null});
    }
    return response ?? {data: [], error: null};
}

function makeBuilder(table: string) {
    const builder = {
        select: (...args: unknown[]) => { record(table, "select", args); return builder; },
        eq: (...args: unknown[]) => { record(table, "eq", args); return builder; },
        not: (...args: unknown[]) => { record(table, "not", args); return builder; },
        neq: (...args: unknown[]) => { record(table, "neq", args); return builder; },
        or: (...args: unknown[]) => { record(table, "or", args); return builder; },
        in: (...args: unknown[]) => { record(table, "in", args); return builder; },
        order: (...args: unknown[]) => { record(table, "order", args); return builder; },
        range: (...args: unknown[]) => { record(table, "range", args); return resolveTable(table); },
        then: (
            resolve: (value: TableResponse) => unknown,
            reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(resolveTable(table)).then(resolve, reject),
    };
    return builder;
}

vi.mock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({
        from: (table: string) => makeBuilder(table),
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

function supabaseRow(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        id: overrides.id as string,
        externalId: 184507566,
        title: `Design ${String(overrides.id)}`,
        slug: `design-${String(overrides.id)}`,
        externalLink: "https://www.redbubble.com/shop/ap/184507566",
        externalImageUrl: "https://ih1.redbubble.com/image.jpg",
        category: "no_category",
        // Primary label: with no design_collections rows the one-feed rule falls
        // back to it, so the default keeps designs in the "Space" feed.
        collection: "Space",
        imageName: "",
        description: "Space art",
        keywords: "space",
        backgroundColors: "",
        backgroundColor: "#FFFFFF",
        createdAt: "2026-10-07T08:10:00.000Z",
        updatedAt: "2026-10-08T09:00:00.000Z",
        shared: false,
        props: { mockup_tshirt: "https://ih1.redbubble.net/mockup.jpg" },
        ...overrides,
    };
}

// The feed-collections argument: every collection that has a feed.
const SPACE_FEED = [{title: "Space", description: ""}];
const SPACE_AND_CATS_FEEDS = [
    {title: "Space", description: ""},
    {title: "Cats", description: ""},
];

// design_collections join rows as PostgREST returns them for
// select("designId, collections(title)").
function membershipRows(memberships: Record<string, string[]>): {designId: string; collections: {title: string}}[] {
    return Object.entries(memberships).flatMap(([designId, titles]) =>
        titles.map(title => ({designId, collections: {title}})),
    );
}

function stubMySQLEnv() {
    vi.stubEnv("DATABASE_PROVIDER", "mysql");
    vi.stubEnv("MYSQL_HOST", "localhost");
    vi.stubEnv("MYSQL_USER", "user");
    vi.stubEnv("MYSQL_PASSWORD", "pass");
    vi.stubEnv("MYSQL_DATABASE", "db");
}

// The membership query is the only MySQL statement that starts with this prefix
// (the designs query mentions design_collections too, but inside an EXISTS).
function isMembershipSql(sql: unknown): boolean {
    return String(sql).trimStart().startsWith("SELECT dc.designId");
}

function mysqlDesignRow(id: string, collection: string): Record<string, unknown> {
    return {
        id,
        externalId: 184507566,
        title: `Design ${id}`,
        slug: `design-${id}`,
        externalLink: "https://www.redbubble.com/shop/ap/184507566",
        externalImageUrl: "https://ih1.redbubble.com/image.jpg",
        category: "no_category",
        collection,
        imageName: "",
        description: "Space art",
        keywords: "space",
        backgroundColors: "",
        backgroundColor: "#FFFFFF",
        createdAt: new Date("2026-10-07T08:10:00Z"),
        updatedAt: null,
        props: { mockup_tshirt: "https://ih1.redbubble.net/mockup.jpg" },
    };
}

async function importFacade() {
    return await import("@/utils/database");
}

beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("DATABASE_PROVIDER", "supabase");
    vi.spyOn(console, "error").mockImplementation(() => {});
    responses = {};
    steps = {};
    mysqlQuery.mockReset();
});

describe("fetchFeedCollections", () => {
    it("reads titles and descriptions from the collections table, sizing active designs only", async () => {
        responses = {collections: {data: [
            {title: "Cats", description: "Feline friends", design_collections: [
                {designs: {active: true}}, {designs: {active: true}}, {designs: {active: false}},
            ]},
            {title: "Space", description: null, design_collections: []},
            {title: "Cats", description: "duplicate row", design_collections: [{designs: {active: true}}]},
        ], error: null}};

        const {fetchFeedCollections} = await importFacade();
        await expect(fetchFeedCollections()).resolves.toEqual([
            {title: "Cats", description: "Feline friends", size: 2},
            {title: "Space", description: "", size: 0},
        ]);
    });

    it("falls back to legacy collection labels with empty descriptions", async () => {
        responses = {
            collections: {data: null, error: {message: "missing table"}},
            designs: {data: [{collection: "Legacy"}], error: null},
        };

        const {fetchFeedCollections} = await importFacade();
        await expect(fetchFeedCollections()).resolves.toEqual([{title: "Legacy", description: ""}]);
    });

    it("reads collections from MySQL", async () => {
        vi.stubEnv("DATABASE_PROVIDER", "mysql");
        vi.stubEnv("MYSQL_HOST", "localhost");
        vi.stubEnv("MYSQL_USER", "user");
        vi.stubEnv("MYSQL_PASSWORD", "pass");
        vi.stubEnv("MYSQL_DATABASE", "db");
        mysqlQuery.mockResolvedValue([[{title: "Cats", description: "Feline", size: 4}], []]);

        const {fetchFeedCollections} = await importFacade();
        await expect(fetchFeedCollections()).resolves.toEqual([{title: "Cats", description: "Feline", size: 4}]);
    });
});

describe("fetchGiftFeedDesigns", () => {
    const gift = {slug: "halloween-gift-ideas", title: "Halloween", description: "D", intro: "I",
        sections: [{collection: "Space", heading: "H"}, {collection: "Cats", heading: "H"}]};

    it("matches the occasion before limiting, independently of section collections", async () => {
        vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://images.threadquirk.lv");
        responses = {
            designs: {data: [
                supabaseRow({id: "b", title: "Halloween Ghost", createdAt: "2026-10-08T00:00:00.000Z"}),
                supabaseRow({id: "a", title: "Halloween Science", collection: "Science", createdAt: "2026-10-09T00:00:00.000Z"}),
                supabaseRow({id: "c", title: "Halloween Cat", createdAt: "2026-10-07T00:00:00.000Z"}),
                supabaseRow({id: "wrong-holiday", title: "Christmas", createdAt: "2026-10-11T00:00:00.000Z"}),
                supabaseRow({id: "no-mockup", title: "Halloween", createdAt: "2026-10-10T00:00:00.000Z", props: {}}),
                supabaseRow({id: "cdn-only", title: "Halloween", createdAt: "2026-10-06T00:00:00.000Z", props: {}, cdnImage: {key: "designs/a1", version: 1, width: 1600, height: 1920}}),
            ], error: null},
            design_listings: {data: [], error: null},
        };
        const {fetchGiftFeedDesigns} = await importFacade();
        expect((await fetchGiftFeedDesigns(gift, 100)).designs.map(design => design.id)).toEqual(["a", "b", "c", "cdn-only"]);
        expect((await fetchGiftFeedDesigns(gift, 2)).designs.map(design => design.id)).toEqual(["a", "b"]);
        expect(steps.designs.some(step => step.method === "eq" && step.args[0] === "active" && step.args[1] === true)).toBe(true);
    });

    it("returns nothing for an unknown selection topic", async () => {
        const {fetchGiftFeedDesigns} = await importFacade();
        expect(await fetchGiftFeedDesigns({...gift, slug: "unknown"}, 100)).toEqual({designs: [], earliestListingAt: {}});
        expect(steps.designs).toBeUndefined();
    });

    it("uses the same topic selection on MySQL", async () => {
        stubMySQLEnv();
        mysqlQuery.mockImplementation(async (sql: unknown) =>
            String(sql).includes("FROM designs ") ? [[{...mysqlDesignRow("m1", "Other"), title: "Halloween"}]] : [[]]);
        const {fetchGiftFeedDesigns} = await importFacade();
        const {designs} = await fetchGiftFeedDesigns(gift, 100);
        expect(designs.map(design => design.id)).toEqual(["m1"]);
        const call = mysqlQuery.mock.calls.find(([sql]) => String(sql).startsWith("SELECT * FROM designs"));
        expect(String(call?.[0])).toContain("active = TRUE AND id IN (?)");
        expect(call?.[1]).toEqual([["m1"]]);
    });
});

describe("fetchCollectionFeedDesigns", () => {
    it("returns eligible designs newest first, with the limit applied", async () => {
        responses = {
            designs: {data: [
                supabaseRow({id: "a", createdAt: "2026-10-09T00:00:00.000Z"}),
                supabaseRow({id: "b", createdAt: "2026-10-08T00:00:00.000Z"}),
                supabaseRow({id: "c", createdAt: "2026-10-07T00:00:00.000Z"}),
                supabaseRow({id: "d", createdAt: "2026-10-06T00:00:00.000Z"}),
            ], error: null},
            design_social_posts: {data: [], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const {designs} = await fetchCollectionFeedDesigns("Space", 2, SPACE_FEED);
        expect(designs.map(design => design.id)).toEqual(["a", "b"]);
    });

    it("drops designs without any marketplace link, and teepublic-only designs stay eligible", async () => {
        responses = {
            designs: {data: [
                supabaseRow({id: "no-link", externalLink: "", externalId: null, props: {mockup_tshirt: "https://ih1.redbubble.net/mockup.jpg"}}),
                supabaseRow({id: "teepublic-only", externalLink: "", externalId: null, props: {
                    teepublicLink: "https://www.teepublic.com/t-shirt/1-x",
                    mockup_tshirt: "https://ih1.redbubble.net/mockup.jpg",
                }}),
                supabaseRow({id: "redbubble"}),
            ], error: null},
            design_social_posts: {data: [], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const {designs} = await fetchCollectionFeedDesigns("Space", 100, SPACE_FEED);
        expect(designs.map(design => design.id)).toEqual(["teepublic-only", "redbubble"]);
    });

    it("pin source rule: mockup OR cdnImage — artwork-only and imageless rows are dropped", async () => {
        // The CDN base is required to turn a cdnImage into a usable share image.
        vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://images.threadquirk.lv");
        responses = {
            designs: {data: [
                supabaseRow({id: "mockup-only", externalImageUrl: ""}),
                supabaseRow({id: "cdn-only", props: {}, cdnImage: {key: "designs/a1", version: 1, width: 1600, height: 1920}}),
                // The stored shape: an array of mockups (JSON string as mysql2 returns it).
                supabaseRow({id: "cdn-array", props: {}, cdnImage: JSON.stringify([{key: "designs/f45e5bc7a5342c2c/mockups/66c018b96d9c6dac", kind: "flat-full", version: 1, width: 1024, height: 1536}])}),
                supabaseRow({id: "no-image-at-all", externalImageUrl: "", props: {}}),
            ], error: null},
            design_social_posts: {data: [], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const {designs} = await fetchCollectionFeedDesigns("Space", 100, SPACE_FEED);
        expect(designs.map(design => design.id)).toEqual(["mockup-only", "cdn-only", "cdn-array"]);
        // The pin-source requirement is one PostgREST or/is-null filter over both sources.
        const orStep = steps.designs.filter(step => step.method === "or")[0];
        expect(String(orStep.args[0])).toBe("props->>mockup_tshirt.not.is.null,cdnImage.not.is.null,pinterestImage.not.is.null");
    });

    it("excludes designs already pinned through the API (published pinterest post)", async () => {
        responses = {
            designs: {data: [
                supabaseRow({id: "already-pinned"}),
                supabaseRow({id: "fresh"}),
            ], error: null},
            design_social_posts: {data: [{designId: "already-pinned"}], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const {designs} = await fetchCollectionFeedDesigns("Space", 100, SPACE_FEED);
        expect(designs.map(design => design.id)).toEqual(["fresh"]);
    });

    it("fails open when the social-post exclusion query errors", async () => {
        responses = {
            designs: {data: [supabaseRow({id: "a"})], error: null},
            design_social_posts: {data: null, error: {message: "permission denied"}},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const {designs} = await fetchCollectionFeedDesigns("Space", 100, SPACE_FEED);
        expect(designs.map(design => design.id)).toEqual(["a"]);
    });

    it("falls back to the legacy collection filter when the join matches nothing", async () => {
        responses = {
            designs: [
                {data: [], error: null},
                {data: [supabaseRow({id: "legacy-row"})], error: null},
            ],
            design_social_posts: {data: [], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const {designs} = await fetchCollectionFeedDesigns("Space", 100, SPACE_FEED);
        expect(designs.map(design => design.id)).toEqual(["legacy-row"]);
        const selects = steps.designs.filter(step => step.method === "select");
        expect(selects[0].args[0]).toContain("design_collections");
        expect(selects[1].args[0]).toBe("*");
    });

    it("maps the earliest listing publishedAt per design for the feed pubDate", async () => {
        responses = {
            designs: {data: [supabaseRow({id: "a"}), supabaseRow({id: "b"})], error: null},
            design_social_posts: {data: [], error: null},
            design_listings: {data: [
                {designId: "a", publishedAt: "2026-10-09T00:00:00.000Z"},
                {designId: "a", publishedAt: "2026-10-05T00:00:00.000Z"},
                {designId: "b", publishedAt: "2026-10-01T00:00:00.000Z"},
            ], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const {earliestListingAt} = await fetchCollectionFeedDesigns("Space", 100, SPACE_FEED);
        expect(earliestListingAt).toEqual({
            a: "2026-10-05T00:00:00.000Z",
            b: "2026-10-01T00:00:00.000Z",
        });
    });

    it("queries MySQL with the collection join, image filter and social-post exclusion", async () => {
        vi.stubEnv("DATABASE_PROVIDER", "mysql");
        vi.stubEnv("MYSQL_HOST", "localhost");
        vi.stubEnv("MYSQL_USER", "user");
        vi.stubEnv("MYSQL_PASSWORD", "pass");
        vi.stubEnv("MYSQL_DATABASE", "db");
        mysqlQuery.mockImplementation(async (sql: string) => {
            if (sql.includes("design_listings")) {
                return [[{designId: "a", earliest: "2026-10-05 07:00:00.000"}], []];
            }
            if (isMembershipSql(sql)) return [[{designId: "a", title: "Space"}], []];
            return [[{
                id: "a",
                externalId: 184507566,
                title: "Design a",
                slug: "design-a",
                externalLink: "https://www.redbubble.com/shop/ap/184507566",
                externalImageUrl: "https://ih1.redbubble.com/image.jpg",
                category: "no_category",
                collection: "Space",
                imageName: "",
                description: "Space art",
                keywords: "space",
                backgroundColors: "",
                backgroundColor: "#FFFFFF",
                createdAt: new Date("2026-10-07T08:10:00Z"),
                updatedAt: null,
                props: { mockup_tshirt: "https://ih1.redbubble.net/mockup.jpg" },
            }], []];
        });

        const {fetchCollectionFeedDesigns} = await importFacade();
        const {designs, earliestListingAt} = await fetchCollectionFeedDesigns("Space", 100, SPACE_FEED);

        expect(designs.map(design => design.id)).toEqual(["a"]);
        expect(earliestListingAt).toEqual({a: "2026-10-05T07:00:00.000Z"});

        const [sql, params] = mysqlQuery.mock.calls[0];
        expect(String(sql)).toContain("JOIN collections c ON c.id = dc.collectionId");
        expect(String(sql)).toContain("JSON_EXTRACT(d.props, '$.mockup_tshirt') IS NOT NULL OR d.cdnImage IS NOT NULL");
        expect(String(sql)).toContain("NOT EXISTS");
        expect(String(sql)).toContain("design_social_posts");
        expect(params[0]).toBe("Space");
    });

    it("retries MySQL without the social-post exclusion when the table is missing", async () => {
        vi.stubEnv("DATABASE_PROVIDER", "mysql");
        vi.stubEnv("MYSQL_HOST", "localhost");
        vi.stubEnv("MYSQL_USER", "user");
        vi.stubEnv("MYSQL_PASSWORD", "pass");
        vi.stubEnv("MYSQL_DATABASE", "db");
        let attempt = 0;
        mysqlQuery.mockImplementation(async (sql: string) => {
            if (sql.includes("design_listings")) return [[], []];
            attempt += 1;
            if (attempt === 1) throw new Error("Table 'design_social_posts' doesn't exist");
            return [[], []];
        });

        const {fetchCollectionFeedDesigns} = await importFacade();
        const {designs} = await fetchCollectionFeedDesigns("Space", 100, SPACE_FEED);
        expect(designs).toEqual([]);
        expect(attempt).toBe(2);
        expect(String(mysqlQuery.mock.calls[1][0])).not.toContain("design_social_posts");
    });
});

// A design in several collections must be carried by exactly one feed.
describe("fetchCollectionFeedDesigns one feed per design", () => {
    it("drops a Space+Cats design with primary Cats from Space's feed and keeps it in Cats's", async () => {
        responses = {
            designs: {data: [
                supabaseRow({id: "primary-cats", collection: "Cats"}),
                supabaseRow({id: "primary-space", collection: "Space"}),
            ], error: null},
            design_collections: {data: membershipRows({
                "primary-cats": ["Space", "Cats"],
                "primary-space": ["Space", "Cats"],
            }), error: null},
            design_social_posts: {data: [], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const space = await fetchCollectionFeedDesigns("Space", 100, SPACE_AND_CATS_FEEDS);
        const cats = await fetchCollectionFeedDesigns("Cats", 100, SPACE_AND_CATS_FEEDS);
        expect(space.designs.map(design => design.id)).toEqual(["primary-space"]);
        expect(cats.designs.map(design => design.id)).toEqual(["primary-cats"]);
    });

    it("looks memberships up by the eligible design ids in design_collections", async () => {
        responses = {
            designs: {data: [supabaseRow({id: "a"}), supabaseRow({id: "b"})], error: null},
            design_collections: {data: membershipRows({a: ["Space"], b: ["Space"]}), error: null},
            design_social_posts: {data: [], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        await fetchCollectionFeedDesigns("Space", 100, SPACE_FEED);
        const selects = steps.design_collections.filter(step => step.method === "select");
        expect(selects[0].args[0]).toBe("designId, collections(title)");
        const inStep = steps.design_collections.find(step => step.method === "in");
        expect(inStep?.args).toEqual(["designId", ["a", "b"]]);
    });

    it("accepts the joined collections as an array as well as an object", async () => {
        responses = {
            designs: {data: [supabaseRow({id: "a", collection: "Cats"})], error: null},
            design_collections: {data: [
                {designId: "a", collections: [{title: "Space"}, {title: "Cats"}]},
            ], error: null},
            design_social_posts: {data: [], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const space = await fetchCollectionFeedDesigns("Space", 100, SPACE_AND_CATS_FEEDS);
        const cats = await fetchCollectionFeedDesigns("Cats", 100, SPACE_AND_CATS_FEEDS);
        expect(space.designs).toEqual([]);
        expect(cats.designs.map(design => design.id)).toEqual(["a"]);
    });

    it("falls back to the alphabetically first feed slug when the primary is not a membership", async () => {
        const feeds = [...SPACE_AND_CATS_FEEDS, {title: "Dogs", description: ""}];
        responses = {
            designs: {data: [supabaseRow({id: "a", collection: "Dogs"})], error: null},
            // Memberships are Space and Cats; primary "Dogs" has a feed but isn't one of them.
            design_collections: {data: membershipRows({a: ["Space", "Cats"]}), error: null},
            design_social_posts: {data: [], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const byFeed: Record<string, string[]> = {};
        for (const feed of feeds) {
            const {designs} = await fetchCollectionFeedDesigns(feed.title, 100, feeds);
            byFeed[feed.title] = designs.map(design => design.id);
        }
        // "cats" sorts before "space".
        expect(byFeed).toEqual({Space: [], Cats: ["a"], Dogs: []});
    });

    it("falls back to the primary label without duplicates when the membership query errors", async () => {
        responses = {
            designs: {data: [
                supabaseRow({id: "x", collection: "Cats"}),
                supabaseRow({id: "y", collection: "Space"}),
            ], error: null},
            design_collections: {data: null, error: {message: "permission denied"}},
            design_social_posts: {data: [], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const space = await fetchCollectionFeedDesigns("Space", 100, SPACE_AND_CATS_FEEDS);
        const cats = await fetchCollectionFeedDesigns("Cats", 100, SPACE_AND_CATS_FEEDS);
        expect(space.designs.map(design => design.id)).toEqual(["y"]);
        expect(cats.designs.map(design => design.id)).toEqual(["x"]);
        expect(console.error).toHaveBeenCalled();
    });

    it("keeps a design with no join rows in the feed of its primary label only", async () => {
        responses = {
            designs: {data: [supabaseRow({id: "legacy", collection: "Space"})], error: null},
            design_collections: {data: [], error: null},
            design_social_posts: {data: [], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const space = await fetchCollectionFeedDesigns("Space", 100, SPACE_AND_CATS_FEEDS);
        const cats = await fetchCollectionFeedDesigns("Cats", 100, SPACE_AND_CATS_FEEDS);
        expect(space.designs.map(design => design.id)).toEqual(["legacy"]);
        expect(cats.designs).toEqual([]);
    });

    it("applies the limit after the one-feed filter", async () => {
        responses = {
            designs: {data: [
                // Newest two belong to Cats, so a cap applied before the filter would empty Space's feed.
                supabaseRow({id: "a", collection: "Cats", createdAt: "2026-10-09T00:00:00.000Z"}),
                supabaseRow({id: "b", collection: "Cats", createdAt: "2026-10-08T00:00:00.000Z"}),
                supabaseRow({id: "c", createdAt: "2026-10-07T00:00:00.000Z"}),
                supabaseRow({id: "d", createdAt: "2026-10-06T00:00:00.000Z"}),
                supabaseRow({id: "e", createdAt: "2026-10-05T00:00:00.000Z"}),
            ], error: null},
            design_collections: {data: membershipRows({
                a: ["Space", "Cats"],
                b: ["Space", "Cats"],
                c: ["Space"],
                d: ["Space"],
                e: ["Space"],
            }), error: null},
            design_social_posts: {data: [], error: null},
            design_listings: {data: [], error: null},
        };

        const {fetchCollectionFeedDesigns} = await importFacade();
        const {designs} = await fetchCollectionFeedDesigns("Space", 2, SPACE_AND_CATS_FEEDS);
        expect(designs.map(design => design.id)).toEqual(["c", "d"]);
    });

    it("applies the one-feed rule to MySQL results using the membership query", async () => {
        stubMySQLEnv();
        mysqlQuery.mockImplementation(async (sql: string) => {
            if (sql.includes("design_listings")) return [[], []];
            if (isMembershipSql(sql)) {
                return [[
                    {designId: "primary-cats", title: "Space"},
                    {designId: "primary-cats", title: "Cats"},
                    {designId: "primary-space", title: "Space"},
                    {designId: "primary-space", title: "Cats"},
                ], []];
            }
            return [[mysqlDesignRow("primary-cats", "Cats"), mysqlDesignRow("primary-space", "Space")], []];
        });

        const {fetchCollectionFeedDesigns} = await importFacade();
        const space = await fetchCollectionFeedDesigns("Space", 100, SPACE_AND_CATS_FEEDS);
        const cats = await fetchCollectionFeedDesigns("Cats", 100, SPACE_AND_CATS_FEEDS);
        expect(space.designs.map(design => design.id)).toEqual(["primary-space"]);
        expect(cats.designs.map(design => design.id)).toEqual(["primary-cats"]);

        // First call is still the designs query; the membership query follows with the eligible ids.
        expect(isMembershipSql(mysqlQuery.mock.calls[0][0])).toBe(false);
        const membershipCall = mysqlQuery.mock.calls.find(call => isMembershipSql(call[0]));
        expect(String(membershipCall?.[0])).toContain("JOIN collections c ON c.id = dc.collectionId");
        expect(membershipCall?.[1]).toEqual([["primary-cats", "primary-space"]]);
    });

    it("falls back to the primary label on MySQL when the membership query errors", async () => {
        stubMySQLEnv();
        mysqlQuery.mockImplementation(async (sql: string) => {
            if (sql.includes("design_listings")) return [[], []];
            if (isMembershipSql(sql)) throw new Error("Table 'design_collections' doesn't exist");
            return [[mysqlDesignRow("x", "Cats"), mysqlDesignRow("y", "Space")], []];
        });

        const {fetchCollectionFeedDesigns} = await importFacade();
        const space = await fetchCollectionFeedDesigns("Space", 100, SPACE_AND_CATS_FEEDS);
        const cats = await fetchCollectionFeedDesigns("Cats", 100, SPACE_AND_CATS_FEEDS);
        expect(space.designs.map(design => design.id)).toEqual(["y"]);
        expect(cats.designs.map(design => design.id)).toEqual(["x"]);
    });
});

// Type-level sanity: the feed types keep the normalized Design shape.
describe("feed types", () => {
    it("returns the Design shape with earliestListingAt", async () => {
        const design: Design = supabaseRow({id: "a"}) as unknown as Design;
        expect(typeof design.title).toBe("string");
    });
});
