import {Design} from "@/types/design";

export function getSearchTerms(query: string): string[] {
    return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])];
}

function normalizeText(value: string | undefined): string {
    return (value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function containsTerm(text: string, term: string): boolean {
    return text.startsWith(term) || text.includes(` ${term}`);
}

/** Rank all database candidates before paging; stable sort preserves DB date/id ties. */
export function rankSearchDesigns(designs: Design[], terms: string[]): Design[] {
    const phrase = terms.join(" ");
    return designs.map(design => {
        const title = normalizeText(design.title);
        const keywords = normalizeText(design.keywords);
        const description = normalizeText(design.description);
        const matches = terms.every(term =>
            containsTerm(title, term) || containsTerm(keywords, term) || containsTerm(description, term));
        const score = (title === phrase ? 100 : 0) + (containsTerm(title, phrase) ? 20 : 0)
            + (containsTerm(keywords, phrase) ? 10 : 0)
            + terms.reduce((total, term) => total + (containsTerm(title, term) ? 8 : 0)
                + (containsTerm(keywords, term) ? 4 : 0) + (containsTerm(description, term) ? 1 : 0), 0);
        return {design, matches, score};
    }).filter(result => result.matches)
        .sort((a, b) => b.score - a.score)
        .map(result => result.design);
}
