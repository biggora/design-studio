import {describe, expect, it} from "vitest";
import {designGiftTopics, giftPageTopic, GIFT_TOPICS, matchesGiftPage, normalizeGiftTopics, selectGiftSections} from "@/lib/gift-selection";
import type {GiftTopic} from "@/lib/gift-selection";
import type {GiftPage} from "@/lib/gifts";
import type {Design} from "@/types/design";
import {getGiftPages} from "@/lib/gifts";
import giftCopy from "@/docs/plans/2026-10-28-gift-selection-copy.json";

const design = (title: string, keywords = "", extra: Partial<Design> = {}): Design => ({
    id: title, title, keywords, collection: "Family", createdAt: "2026-10-28", ...extra,
} as Design);
const page = (topic: GiftTopic): GiftPage => ({slug: "custom", topic, title: "T", description: "D", intro: "I",
    sections: [{collection: "Family", heading: "Family"}]});

describe("gift subject selection", () => {
    it.each([
        ["halloween", "Haunting Takes Longer Without Coffee Sleepy Ghost Halloween Humor", ""],
        ["black-friday", "Staying Home Beats the Crowds Cozy Anti Black Friday Homebody Humor", ""],
        ["thanksgiving", "The Flock Took a Running Start", "turkey trot,thanksgiving run"],
        ["christmas", "My Cat Has Notes on Your Tree Cat Christmas Pet Humor", ""],
        ["valentines", "Romantic Couple Dancing Silhouette", ""],
        ["mothers-day", "Mom. Home Base Since Day One. Mothers Day Typography", ""],
        ["fathers-day", "Dad. My First Safe Landing. Father’s Day Love", ""],
        ["back-to-school", "My Lab Partner Needs a Hall Pass", ""],
        ["developers", "PHP Still Running Your Website Funny Programmer Typography", ""],
        ["coworkers", "Remote Work Desk Club", ""],
        ["pet-lovers", "Professional Napper Curled Up Sleeping Cats", ""],
        ["gamers-and-geeks", "My Respawn Point Is the Candy Bowl Pixel Ghost Gamer Halloween", ""],
        ["food-lovers", "Good Company Travels in Casseroles Friendsgiving Potluck Humor", "baking,food humor"],
        ["family-and-friends", "My Dad Gets Mad But Still Loves Me", ""],
        ["hobbyists", "Stringing Together a Small Triumph Pony Bead Craft Humor", ""],
        ["self-care-and-wellness", "My Mind Deserves a Softer Voice", "self care,mental health"],
    ] as const)("recognizes %s from the print subject", (topic, title, keywords) => {
        expect(matchesGiftPage(design(title, keywords), page(topic))).toBe(true);
    });

    it.each([
        ["halloween", "Running Turkey Sprinter Cartoon Thanksgiving Mascot", "halloween gift"],
        ["halloween", "Mom Makes the Ordinary Golden Mother's Day Sunshine", ""],
        ["halloween", "The Alibi Has Footnotes True Crime Detective Humor", ""],
        ["halloween", "Cute Monsters Holding Keep Out Sign", "monster,cute,holiday"],
        ["halloween", "Easter Bunny", "halloween gift,halloween"],
        ["christmas", "Ghost Halloween", "christmas gift"],
        ["thanksgiving", "We Put the Group Chat in Christmas Sweaters", "thanksgiving"],
        ["black-friday", "Python Programmer", "gift,holiday,sale"],
        ["mothers-day", "Knitting Club", "craft,gift for her"],
        ["fathers-day", "Mom. Home Base Since Day One.", "mothers day"],
        ["fathers-day", "Type Script Funny Coding Slogan", "programmer dad,dev life"],
        ["back-to-school", "Kind Words Mental Health", "self care"],
        ["developers", "Green Python Snake", "reptile"],
        ["coworkers", "My Mind Deserves a Softer Voice", "mental health,self care"],
        ["pet-lovers", "Adorable Monster Friends", "cute,kawaii,monster"],
        ["gamers-and-geeks", "No Cap Baseball Hat Crossed Out", "gen z,internet slang"],
        ["food-lovers", "Elven Paths Prefer Quiet Footsteps", "woodland,fantasy"],
        ["food-lovers", "Java Developer New Class Of Opportunity", "coffee brown orange,developer"],
        ["back-to-school", "Director of Artificial Intelligence Filmmaker", "film school,varsity"],
        ["back-to-school", "Python Natural Indentation Programmer Typography", "computer science student,programmer"],
        ["valentines", "Markdown Is My Formatting Love Language", "developer,typography"],
    ] as const)("rejects unrelated %s print: %s", (topic, title, keywords) => {
        expect(matchesGiftPage(design(title, keywords), page(topic))).toBe(false);
    });

    it("does not match substrings or generic marketing descriptions", () => {
        const print = design("Cathedral in Catalonia", "education,therapy", {description: "A perfect Halloween Christmas gift for cat lovers."});
        expect(matchesGiftPage(print, page("pet-lovers"))).toBe(false);
        expect(matchesGiftPage(print, page("halloween"))).toBe(false);
    });

    it("accepts explicit cross-occasion subjects but preserves stronger title evidence", () => {
        expect(designGiftTopics(design("Halloween Meets Christmas", ""))).toEqual(expect.arrayContaining(["halloween", "christmas"]));
        expect(matchesGiftPage(design("Christmas Dog", "cat mom"), page("mothers-day"))).toBe(false);
    });

    it("reviewed markers replace automatic detection and survive metadata changes", () => {
        const reviewed = design("Christmas Typography", "christmas", {giftTopics: ["halloween"]});
        expect(designGiftTopics(reviewed)).toEqual(["halloween"]);
        expect(designGiftTopics({...reviewed, title: "New title", keywords: ""})).toEqual(["halloween"]);
        expect(designGiftTopics({...reviewed, giftTopics: []})).toEqual([]);
        expect(designGiftTopics({...reviewed, active: false})).toEqual([]);
        expect(designGiftTopics({...reviewed, giftTopics: null})).toContain("christmas");
    });

    it("normalizes SQL JSON values, deduplicates and fails closed for corrupt markers", () => {
        expect(normalizeGiftTopics('["halloween","halloween"]')).toEqual(["halloween"]);
        for (const value of ["broken", {}, ["typo"], ["halloween", 1]]) expect(normalizeGiftTopics(value)).toEqual([]);
        expect(normalizeGiftTopics(undefined)).toBeNull();
    });

    it("requires a known default or explicit topic, never falls back to entire collections", () => {
        expect(giftPageTopic({slug: "halloween-gift-ideas"})).toBe("halloween");
        expect(giftPageTopic({slug: "toString"})).toBeUndefined();
        expect(matchesGiftPage(design("Halloween Ghost"), {slug: "unknown"})).toBe(false);
        expect(GIFT_TOPICS).toHaveLength(16);
    });

    it("has a valid explicit subject for every page in the reviewed rollout copy", () => {
        const pages = getGiftPages(giftCopy.giftPages);
        expect(pages).toHaveLength(16);
        expect(new Set(pages.map(p => giftPageTopic(p))).size).toBe(16);
        expect(pages.every(p => !!p.topic)).toBe(true);
    });

    it("does not infer a family occasion from incidental language or cross-selling", () => {
        expect(matchesGiftPage(design("Stringing Together a Small Triumph", "bead craft"), page("family-and-friends"))).toBe(false);
        expect(matchesGiftPage(design("Professional Napper Sleeping Cats", "cat mom"), page("mothers-day"))).toBe(false);
        expect(matchesGiftPage(design("A Scenic Meadow", "perfect halloween gift"), page("halloween"))).toBe(false);
    });
});

describe("gift sections", () => {
    it("filters before limits and includes matches outside configured collections once", () => {
        const p = {...page("halloween"), sections: [{collection: "Family", heading: "Family"}, {collection: "Games", heading: "Games"}]};
        const prints = [design("Christmas", "", {id: "bad"}), design("Halloween Cousins", "", {id: "family"}),
            design("Halloween Ghost Gamer", "", {id: "game", collection: "Other"}),
            design("Halloween Chemistry", "", {id: "other", collection: "Science"}),
            design("Hidden Halloween", "", {id: "hidden", active: false})];
        const memberships = new Map([["game", ["Games", "Family"]]]);
        const sections = selectGiftSections(p, [...prints, prints[1]], memberships, 8);
        expect(sections.map(s => s.designs.map(d => d.id))).toEqual([["family", "game"], ["other"]]);
        expect(sections[1].collection).toBeUndefined();
        expect(selectGiftSections(p, prints, memberships, 1)[0].designs[0].id).toBe("family");
    });
});
