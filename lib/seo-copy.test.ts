import {describe, expect, it} from "vitest";
import type {SiteConfig} from "@/lib/store";
import {buildStudioRows, summarizeRows, unknownCollections, validateSeoCopyPlan} from "@/lib/seo-copy";

const known = new Set(["Programming", "Pets"]);
const collectionPage = {collection: "Programming", title: "T", description: "D", intro: "I"};
const giftPage = {slug: "dev", title: "T", description: "D", intro: "I", sections: [{collection: "Pets", heading: "H"}]};

describe("validateSeoCopyPlan", () => {
    it("accepts valid plans and plans without pages", () => {
        expect(() => validateSeoCopyPlan({collectionPages: [collectionPage], giftPages: [giftPage]})).not.toThrow();
        expect(() => validateSeoCopyPlan({intro: "x"})).not.toThrow();
    });
    it("throws on structurally invalid pages", () => {
        expect(() => validateSeoCopyPlan({collectionPages: [{...collectionPage, intro: ""}]})).toThrow("Invalid collectionPages");
        expect(() => validateSeoCopyPlan({giftPages: [{...giftPage, sections: []}]})).toThrow("Invalid giftPages");
        expect(() => validateSeoCopyPlan({giftPages: [giftPage, giftPage]})).toThrow("Invalid giftPages");
    });
    it("does not throw on collections missing from the DB", () => {
        expect(() => validateSeoCopyPlan({collectionPages: [{...collectionPage, collection: "Nope"}]})).not.toThrow();
    });
});

describe("unknownCollections", () => {
    it("returns sorted, deduplicated unknown names across collection and gift pages", () => {
        const plan = {
            collectionPages: [{...collectionPage, collection: "Outdoors"}, collectionPage],
            giftPages: [{...giftPage, sections: [{collection: "Hobby Clubs", heading: "H"}, {collection: "Outdoors", heading: "H"}, {collection: "Pets", heading: "H"}]}],
        };
        expect(unknownCollections(plan, known)).toEqual(["Hobby Clubs", "Outdoors"]);
        expect(unknownCollections({intro: "x"}, known)).toEqual([]);
    });
});

describe("buildStudioRows and summarizeRows", () => {
    it("emits rows only for present fields, with arrays as JSON text", () => {
        expect(buildStudioRows({home: {title: "T"}, intro: "I", giftPages: [giftPage]})).toEqual([
            {key: "home.title", value: "T"}, {key: "intro", value: "I"}, {key: "giftPages", value: JSON.stringify([giftPage])},
        ]);
        expect(buildStudioRows({})).toEqual([]);
    });

    it("marks rows changed or unchanged and shortens scalars", () => {
        const long = "x".repeat(120);
        const config = {home: {title: "Same", heading: "Old", description: ""}, intro: long, collectionPages: JSON.stringify([collectionPage])} as unknown as SiteConfig;
        const summary = summarizeRows(buildStudioRows({
            home: {title: "Same", heading: "New"}, intro: "y".repeat(100), collectionPages: [collectionPage], giftPages: [giftPage],
        }), config);
        expect(summary.map(item => [item.key, item.status])).toEqual([
            ["home.title", "unchanged"], ["home.heading", "changed"], ["intro", "changed"],
            ["collectionPages", "unchanged"], ["giftPages", "changed"],
        ]);
        const intro = summary.find(item => item.key === "intro");
        expect(String(intro?.old)).toHaveLength(80);
        expect(String(intro?.new)).toHaveLength(80);
        expect(summary.find(item => item.key === "collectionPages")).toMatchObject({old: 1, new: 1});
        expect(summary.find(item => item.key === "giftPages")).toMatchObject({old: null, new: 1});
    });
});
