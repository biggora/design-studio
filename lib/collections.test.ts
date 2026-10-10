import {describe, expect, it} from "vitest";
import {collectionPath, curatedCollectionTitles, getCollectionPages} from "@/lib/collections";

describe("collection configuration", () => {
    const page = {collection: "Pets & Friends", title: "Pet prints", description: "Cat and dog designs.", intro: "Choose a pet print."};
    it("reads JSON studio values and ignores invalid/duplicate profiles", () => {
        expect(getCollectionPages(JSON.stringify([page, page, {collection: "Unknown"}, null]))).toEqual([page]);
        expect(getCollectionPages("not JSON")).toEqual([]);
        expect(getCollectionPages(undefined)).toEqual([]);
    });
    it("encodes special characters while preserving page-specific canonical URLs", () => {
        expect(collectionPath('Cats & "Dogs"', 2)).toBe("/designs?collection=Cats+%26+%22Dogs%22&page=2");
    });
    it("deduplicates reviewed membership titles without accepting malformed props", () => {
        expect(curatedCollectionTitles({curatedCollections: ["Pets", "Pets", "", 42]})).toEqual(["Pets"]);
        expect(curatedCollectionTitles(null)).toEqual([]);
    });
});
