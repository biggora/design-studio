import {describe, it, expect} from "vitest";
import {Design} from "@/types/design";
import {getSearchTerms, rankSearchDesigns} from "@/lib/catalog-search";

const design = (id: string, title: string, keywords = "", description = "") =>
    ({id, title, keywords, description} as Design);

describe("catalog search", () => {
    it("normalizes case, punctuation, repeated terms and whitespace", () => {
        expect(getSearchTerms("  CAT lover, gift cat! ")).toEqual(["cat", "lover", "gift"]);
        expect(getSearchTerms("%_()\"\\")).toEqual([]);
    });

    it("finds terms across title, tags and description in any order", () => {
        const rows = [
            design("tags", "Pixel Art", "cat lover gift"),
            design("description", "Pixel Art", "", "A gift for every cat lover"),
            design("mixed", "Cat", "lover", "A thoughtful gift"),
            design("missing", "Cat Lover", "", "A portrait"),
        ];
        for (const query of ["cat lover gift", "gift cat lover"]) {
            expect(rankSearchDesigns(rows, getSearchTerms(query)).map(row => row.id).sort())
                .toEqual(["description", "mixed", "tags"]);
        }
    });

    it("ranks exact titles, title phrases, tags and descriptions ahead of weaker matches", () => {
        const rows = [
            design("description", "Pixel Art", "", "A cat lover gift"),
            design("tags", "Pixel Art", "cat lover gift"),
            design("title", "Cat Lover Gift Graphic"),
            design("exact", "Cat Lover Gift"),
        ];
        expect(rankSearchDesigns(rows, getSearchTerms("cat lover gift")).map(row => row.id))
            .toEqual(["exact", "title", "tags", "description"]);
    });

    it("preserves the database order for relevance ties without mutating rows", () => {
        const rows = [design("newer", "Cat"), design("older", "Cat")];
        expect(rankSearchDesigns(rows, ["cat"]).map(row => row.id)).toEqual(["newer", "older"]);
        expect(rows.map(row => row.id)).toEqual(["newer", "older"]);
    });

    it("matches word prefixes such as cats and lovers without finding cat inside vacation", () => {
        const rows = [
            design("plural", "Cats", "lovers", "Gift ideas"),
            design("substring", "Vacation", "beach lovers", "Gift ideas"),
        ];
        expect(rankSearchDesigns(rows, getSearchTerms("cat lover gift")).map(row => row.id))
            .toEqual(["plural"]);
    });

    it("tolerates missing optional text without matching unrelated designs", () => {
        expect(rankSearchDesigns([{id: "none", title: "Dog"} as Design], ["cat"]))
            .toEqual([]);
    });
});
