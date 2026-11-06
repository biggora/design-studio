import {expect, it} from "vitest";
import {getDesignPages} from "@/lib/design-pages";
import {getGiftPages} from "@/lib/gifts";
import {buildStudioRows, isChanged, validateSeoCopyPlan} from "@/lib/seo-copy";
import type {SiteConfig} from "@/lib/store";
import quiltingCopy from "@/docs/plans/2026-11-06-quilting-seo-copy.json";

it("round-trips the reviewed copy through studio JSON, including related and gift links", () => {
    const plan = {...quiltingCopy, giftPages: getGiftPages(quiltingCopy.giftPages)};
    expect(plan.giftPages).toHaveLength(quiltingCopy.giftPages.length);
    validateSeoCopyPlan(plan);
    const row = buildStudioRows(plan).find(row => row.key === "designPages")!;
    expect(getDesignPages(row.value)).toEqual(quiltingCopy.designPages);
    expect(isChanged(row, {designPages: quiltingCopy.designPages} as SiteConfig)).toBe(false);
    expect(isChanged(row, {} as SiteConfig)).toBe(true);
});

it("rejects duplicate profiles, blank copy and links outside canonical design slugs", () => {
    const page = quiltingCopy.designPages[0];
    for (const pages of [[page, page], [{...page, heading: " "}],
        [{...page, related: {heading: "More", links: [{slug: "https://example.com", label: "Bad"}]}}]]) {
        expect(() => validateSeoCopyPlan({designPages: pages})).toThrow("Invalid designPages");
    }
    expect(getDesignPages("broken")).toEqual([]);
    expect(getDesignPages(null)).toEqual([]);
    const hobby = getGiftPages(quiltingCopy.giftPages).find(page => page.slug === "gifts-for-hobbyists")!;
    expect(() => validateSeoCopyPlan({giftPages: [{...hobby, designLinks: {heading: "More", links: [{slug: "../outside", label: "Bad"}]}}]}))
        .toThrow("Invalid giftPages");
});
