import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {execFileSync} from "node:child_process";
import {createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import mysql from "mysql2/promise";
import {getGiftPages} from "@/lib/gifts";

vi.mock("next/cache", () => ({unstable_cache: (fn: unknown) => fn}));
const enabled = process.env.GIFTS_TEST_DATABASES === "1";
const pg = (sql: string) => execFileSync("docker", ["compose", "-p", "design-studio-gifts-test", "-f", "tests/gifts/compose.yml",
    "exec", "-T", "postgres", "psql", "-X", "-qAt", "-U", "postgres", "-d", "gifts_test", "-v", "ON_ERROR_STOP=1"], {input: sql, encoding: "utf8"}).trim();
const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const gift = {slug: "halloween-gift-ideas", title: "Halloween", intro: "I", description: "D",
    sections: [{collection: "Family", heading: "Family"}, {collection: "Games", heading: "Games"}]};
const token = (role: string) => {
    const head = Buffer.from(JSON.stringify({alg: "HS256", typ: "JWT"})).toString("base64url");
    const body = Buffer.from(JSON.stringify({role, exp: Math.floor(Date.now() / 1000) + 3600})).toString("base64url");
    return `${head}.${body}.${createHmac("sha256", "local-gifts-only-secret-at-least-32-characters").update(`${head}.${body}`).digest("base64url")}`;
};

describe.skipIf(!enabled).each(["supabase", "mysql"] as const)("gift selection through real %s facade", provider => {
    let pool: mysql.Pool;
    let db: typeof import("./database");
    const execute = async (sql: string) => provider === "supabase" ? pg(sql) : pool.query(sql);
    const reloadSchema = async (hasGiftTopics: boolean) => {
        if (provider !== "supabase") return;
        pg("NOTIFY pgrst, 'reload schema'");
        for (let attempt = 0; attempt < 30; attempt++) {
            const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/designs?select=*&limit=1`);
            if (r.ok) {
                const rows = await r.json();
                if (rows.length && Object.hasOwn(rows[0], "giftTopics") === hasGiftTopics) return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error("PostgREST schema did not refresh");
    };
    beforeAll(async () => {
        vi.resetModules();
        vi.stubEnv("DATABASE_PROVIDER", provider);
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `http://127.0.0.1:${process.env.GIFTS_API_PORT || 33330}`);
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", token("anon"));
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", token("service_role"));
        for (const [key, value] of Object.entries({MYSQL_HOST: "127.0.0.1", MYSQL_PORT: process.env.GIFTS_MYSQL_PORT || "33331",
            MYSQL_USER: "root", MYSQL_PASSWORD: "gifts-test", MYSQL_DATABASE: "gifts_test"})) vi.stubEnv(key, value);
        if (provider === "mysql") pool = mysql.createPool({host: "127.0.0.1", port: Number(process.env.GIFTS_MYSQL_PORT || 33331),
            user: "root", password: "gifts-test", database: "gifts_test", multipleStatements: true});
        await execute("DELETE FROM designs; DELETE FROM collections;");
        // Upgrade proof: simulate an install without the column and apply twice.
        await execute(`ALTER TABLE designs DROP COLUMN ${provider === "supabase" ? '"giftTopics"' : "giftTopics"}`);
        for (let n = 0; n < 2; n++) await execute(readFileSync(`init/migrations/016_gift_topics_${provider === "supabase" ? "postgres" : "mysql"}.sql`, "utf8"));
        const q = (name: string) => provider === "supabase" ? `"${name}"` : `\`${name}\``;
        const rows = Array.from({length: 501}, (_, n) => `('${id(n)}','Christmas filler ${n}','','halloween','Family','2026-10-28')`);
        rows.push(`('${id(501)}','Halloween Ghost','','halloween','Family','2025-01-01')`);
        rows.push(`('${id(502)}','Halloween Chemistry','','halloween','Science','2025-01-02')`);
        rows.push(`('${id(503)}','Hidden Halloween','','halloween','Family','2025-01-03')`);
        await execute(`INSERT INTO designs (id,title,description,keywords,collection,${q("createdAt")}) VALUES ${rows.join(",")};
            UPDATE designs SET active = FALSE WHERE id = '${id(503)}';
            UPDATE designs SET ${q("externalLink")}='https://www.redbubble.com/shop/ap/1', props='{"mockup_tshirt":"https://ih1.redbubble.net/tee.jpg"}';`);
        await reloadSchema(true);
        db = await import("./database");
    }, 30000);
    afterAll(async () => {await db?.closeDatabaseConnections(); await pool?.end(); vi.unstubAllEnvs();});

    it("finds older matching prints past 501 unrelated items, deduplicates and adds another collection", async () => {
        const sections = await db.fetchGiftPageSections(gift, 1);
        expect(sections.map(s => s.designs.map(d => d.id))).toEqual([[id(501)], [id(502)]]);
        expect(sections[1].collection).toBeUndefined();
        const feed = await db.fetchGiftFeedDesigns(gift, 100);
        expect(feed.designs.map(d => d.id)).toEqual([id(502), id(501)]);
        expect((await db.fetchLiveGiftPages([gift, {...gift, slug: "unknown"}])).map(p => p.slug)).toEqual([gift.slug]);
    });

    it("automatically admits new relevant uploads but rejects newer other-holiday and inactive prints", async () => {
        const dateColumn = provider === "supabase" ? '"createdAt"' : "createdAt";
        await execute(`INSERT INTO designs (id,title,description,keywords,collection,${dateColumn})
            VALUES ('${id(504)}','New Halloween Gamer','','halloween,gaming','Games','2026-10-29');`);
        const sections = await db.fetchGiftPageSections(gift, 8);
        expect(sections.flatMap(s => s.designs).map(d => d.id)).toEqual([id(501), id(504), id(502)]);
    });

    it("keeps reviewed markers through metadata updates, supports explicit exclusion and resetting to automatic", async () => {
        const key = id(501);
        await db.setDesignGiftTopics(key, ["thanksgiving"]);
        await execute(`UPDATE designs SET title = 'Renamed Halloween', keywords = 'halloween,christmas' WHERE id = '${key}'`);
        expect((await db.getDesignById(key))?.design.giftTopics).toEqual(["thanksgiving"]);
        expect((await db.fetchGiftPageSections(gift)).flatMap(s => s.designs).some(d => d.id === key)).toBe(false);
        await db.setDesignGiftTopics(key, []);
        expect((await db.getDesignById(key))?.design.giftTopics).toEqual([]);
        await db.setDesignGiftTopics(key, null);
        expect((await db.fetchGiftPageSections(gift)).flatMap(s => s.designs).some(d => d.id === key)).toBe(true);
        await expect(db.setDesignGiftTopics(id(9999), [])).rejects.toThrow(/not found|denied/i);
    });

    it("uses the same supported topic for all 16 configured page types", async () => {
        const pages = getGiftPages(JSON.parse(readFileSync("docs/plans/2026-10-17-audience-seo-copy.json", "utf8")).giftPages);
        expect(pages).toHaveLength(16);
        expect((await db.fetchLiveGiftPages(pages)).every(p => ["halloween-gift-ideas", "christmas-gift-ideas", "gifts-for-gamers-and-geeks"].includes(p.slug))).toBe(true);
    });

    it("serves filtered pages and feeds before migration and reads markers immediately after it", async () => {
        await execute(`ALTER TABLE designs DROP COLUMN ${provider === "supabase" ? '"giftTopics"' : "giftTopics"}`);
        try {
            await reloadSchema(false);
            const sections = await db.fetchGiftPageSections(gift);
            expect(sections.flatMap(s => s.designs).map(d => d.id)).toEqual([id(501), id(504), id(502)]);
            expect((await db.fetchGiftPageDesigns(gift)).designs.map(d => d.id)).toEqual([id(504), id(502), id(501)]);
            expect((await db.fetchGiftFeedDesigns(gift, 100)).designs.map(d => d.id)).toEqual([id(502), id(501)]);
        } finally {
            await execute(readFileSync(`init/migrations/016_gift_topics_${provider === "supabase" ? "postgres" : "mysql"}.sql`, "utf8"));
            await reloadSchema(true);
        }
        await db.setDesignGiftTopics(id(501), []);
        expect((await db.fetchGiftPageSections(gift)).flatMap(s => s.designs).some(d => d.id === id(501))).toBe(false);
        await db.setDesignGiftTopics(id(501), null);
    });
    it("lists the entire gift topic with scoped search, category memberships and twenty-item pages", async () => {
        const q = (name: string) => provider === "supabase" ? `"${name}"` : `\`${name}\``;
        const rows = Array.from({length: 25}, (_, n) =>
            `('${id(600 + n)}','Thanksgiving Print ${n}','Warm apple cider','turkey','Family','2026-10-29')`);
        rows.push(`('${id(625)}','Hidden Thanksgiving','','turkey','Family','2026-10-29')`);
        rows.push(`('${id(626)}','Reviewed Gathering','Warm apple cider','','Science','2026-10-29')`);
        await execute(`INSERT INTO designs (id,title,description,keywords,collection,${q("createdAt")}) VALUES ${rows.join(",")};
            UPDATE designs SET active = FALSE WHERE id = '${id(625)}';`);
        await db.setDesignGiftTopics(id(626), ["thanksgiving"]);
        await db.setDesignGiftTopics(id(600), []);
        await execute(`INSERT INTO collections (id,title,${q("externalId")}) VALUES ('${id(700)}','Food',700);
            INSERT INTO design_collections (${q("designId")},${q("collectionId")}) VALUES ('${id(601)}','${id(700)}');`);
        const thanksgiving = {...gift, slug: "thanksgiving-gift-ideas"};
        const first = await db.fetchGiftPageDesigns(thanksgiving);
        const second = await db.fetchGiftPageDesigns(thanksgiving, {page: 2});
        expect(first.total).toBe(25);
        expect(first.hasDesigns).toBe(true);
        expect(first.designs).toHaveLength(20);
        expect(second.designs).toHaveLength(5);
        expect(new Set([...first.designs, ...second.designs].map(d => d.id)).size).toBe(25);
        expect(first.designs[0].id).toBe(id(626));
        expect(first.collections).toEqual(["Family", "Food", "Science"]);
        const searched = await db.fetchGiftPageDesigns(thanksgiving, {search: "apple cider", page: 2});
        expect(searched.total).toBe(25);
        expect(searched.designs).toHaveLength(5);
        expect((await db.fetchGiftPageDesigns(thanksgiving, {search: "Thanksgiving Print 24"})).designs.map(d => d.id)).toEqual([id(624)]);
        expect((await db.fetchGiftPageDesigns(thanksgiving, {search: "turkey"})).total).toBe(24);
        expect((await db.fetchGiftPageDesigns(thanksgiving, {search: "apple banana"})).total).toBe(0);
        const food = await db.fetchGiftPageDesigns(thanksgiving, {collection: "Food", search: "apple cider"});
        expect(food.designs.map(d => d.id)).toEqual([id(601)]);
        expect(food.collections).toEqual(first.collections);
        expect((await db.fetchGiftPageDesigns(thanksgiving, {collection: "Science"})).designs.map(d => d.id)).toEqual([id(626)]);
        expect((await db.fetchGiftPageDesigns(thanksgiving, {search: "Halloween"})).total).toBe(0);
        expect((await db.fetchGiftPageDesigns(thanksgiving, {collection: "unknown"}))).toMatchObject({total: 0, hasDesigns: true, designs: []});
        expect((await db.fetchGiftPageDesigns(thanksgiving, {search: "!!!"})).total).toBe(0);
        expect((await db.fetchGiftPageDesigns(thanksgiving, {page: 999})).page).toBe(2);
        expect((await db.fetchGiftPageDesigns({...gift, slug: "unknown"}))).toMatchObject({total: 0, hasDesigns: false});
    });
});
