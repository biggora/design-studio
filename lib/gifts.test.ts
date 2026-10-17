import {describe, expect, it} from "vitest";
import {getGiftPages, giftPath, orderGiftPages} from "@/lib/gifts";

const valid = {
    slug: "gifts-for-programmers", title: "Gifts for Programmers", description: "Coding prints.", intro: "Pick a print.",
    sections: [{collection: "Programming", heading: "Coding jokes"}],
};

describe("getGiftPages", () => {
    it("builds gift paths", () => {
        expect(giftPath("cat-lovers")).toBe("/gifts/cat-lovers");
    });

    it("accepts valid pages with optional fields, as an array or a JSON string", () => {
        const full = {...valid, heading: "Programmer Gifts", sections: [{...valid.sections[0], blurb: "Funny."}],
            faq: [{question: "Q?", answer: "A."}]};
        expect(getGiftPages([full, {...valid, slug: "other"}])).toEqual([full, {...valid, slug: "other"}]);
        expect(getGiftPages(JSON.stringify([valid]))).toEqual([valid]);
    });

    it("returns an empty list for non-arrays and broken JSON", () => {
        expect(getGiftPages(undefined)).toEqual([]);
        expect(getGiftPages("{nope")).toEqual([]);
        expect(getGiftPages({slug: "x"})).toEqual([]);
    });

    it("drops invalid entries", () => {
        const bad = [
            null, "text",
            {...valid, slug: "Bad Slug"}, {...valid, slug: ""},
            {...valid, title: " "}, {...valid, description: undefined}, {...valid, intro: 3},
            {...valid, heading: ""}, {...valid, sections: []}, {...valid, sections: "x"},
            {...valid, sections: [{collection: "", heading: "H"}]},
            {...valid, sections: [{collection: "C", heading: ""}]},
            {...valid, sections: [{collection: "C", heading: "H", blurb: " "}]},
            {...valid, faq: "x"}, {...valid, faq: [{question: "Q?", answer: ""}]},
        ];
        expect(getGiftPages(bad)).toEqual([]);
        expect(getGiftPages([...bad, valid])).toEqual([valid]);
    });

    it("removes duplicate slugs, keeping the first", () => {
        const second = {...valid, title: "Second"};
        expect(getGiftPages([valid, second])).toEqual([valid]);
    });
});

describe("season validation", () => {
    const withSeason = (season: unknown) => ({...valid, season});

    it("accepts valid and year-wrapping windows", () => {
        expect(getGiftPages([withSeason({start: "09-01", end: "10-31"})])).toHaveLength(1);
        expect(getGiftPages([withSeason({start: "12-20", end: "01-05"})])).toHaveLength(1);
    });

    it("drops pages with a malformed season", () => {
        for (const season of [{start: "9-1", end: "10-31"}, {start: "13-01", end: "10-31"}, {start: "09-32", end: "10-31"},
            {start: "09-00", end: "10-31"}, {start: "09-01"}, {end: "10-31"}, {start: 901, end: "10-31"}, "09-01", null]) {
            expect(getGiftPages([withSeason(season)])).toEqual([]);
        }
    });
});

describe("orderGiftPages", () => {
    const page = (slug: string, season?: [string, string]) => ({...valid, slug, ...(season ? {season: {start: season[0], end: season[1]}} : {})});
    const pages = [
        page("halloween", ["09-01", "10-31"]), page("black-friday", ["10-15", "11-30"]),
        page("thanksgiving", ["10-01", "11-26"]), page("christmas", ["10-15", "12-25"]),
        page("evergreen-a"), page("evergreen-b"),
        page("valentines", ["01-02", "02-14"]), page("mothers", ["03-20", "05-12"]),
        page("fathers", ["05-01", "06-21"]), page("back-to-school", ["07-01", "09-15"]),
    ];
    const order = (date: string) => orderGiftPages(pages, new Date(date)).map(item => item.slug);

    it("puts in-season pages first by nearest end, then evergreen, then upcoming seasons", () => {
        expect(order("2026-10-17T12:00:00Z")).toEqual(["halloween", "thanksgiving", "black-friday", "christmas",
            "evergreen-a", "evergreen-b", "valentines", "mothers", "fathers", "back-to-school"]);
    });

    it("lists evergreen pages first when nothing is in season, then by nearest start", () => {
        expect(order("2026-12-26T12:00:00Z")).toEqual(["evergreen-a", "evergreen-b", "valentines", "mothers", "fathers",
            "back-to-school", "halloween", "thanksgiving", "black-friday", "christmas"]);
    });

    it("promotes valentines in January", () => {
        expect(order("2027-01-10T12:00:00Z").slice(0, 4)).toEqual(["valentines", "evergreen-a", "evergreen-b", "mothers"]);
    });

    it("treats the window ends as inclusive", () => {
        expect(order("2026-10-31T00:00:00Z")[0]).toBe("halloween");
        expect(order("2026-11-01T00:00:00Z")[0]).toBe("thanksgiving");
    });

    it("handles windows that wrap the year end", () => {
        const wrap = [page("plain"), page("new-year", ["12-20", "01-05"])];
        expect(orderGiftPages(wrap, new Date("2027-01-02T00:00:00Z")).map(item => item.slug)).toEqual(["new-year", "plain"]);
        expect(orderGiftPages(wrap, new Date("2026-06-01T00:00:00Z")).map(item => item.slug)).toEqual(["plain", "new-year"]);
    });

    it("is leap-safe: 02-29 counts as 02-28 and does not shift later dates", () => {
        const leap = [page("a", ["03-01", "03-10"]), page("b", ["02-29", "03-02"])];
        expect(orderGiftPages(leap, new Date("2028-02-29T00:00:00Z"))[0].slug).toBe("b");
        expect(orderGiftPages(leap, new Date("2027-03-01T00:00:00Z"))[0].slug).toBe("b");
    });

    it("does not mutate its input", () => {
        const input = [page("late", ["12-01", "12-02"]), page("soon", ["10-20", "10-21"])];
        orderGiftPages(input, new Date("2026-10-17T00:00:00Z"));
        expect(input.map(item => item.slug)).toEqual(["late", "soon"]);
    });
});
