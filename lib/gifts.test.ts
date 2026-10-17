import {describe, expect, it} from "vitest";
import {getGiftPages, giftPath} from "@/lib/gifts";

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
