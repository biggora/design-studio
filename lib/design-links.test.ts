import {beforeEach, expect, it, vi} from "vitest";
import {resolveDesignLinks} from "@/lib/design-links";
import type {Design} from "@/types/design";

const getDesignBySlug = vi.hoisted(() => vi.fn());
vi.mock("@/utils/database", () => ({getDesignBySlug}));
beforeEach(() => getDesignBySlug.mockReset());

it("omits missing/inactive, duplicate and self links and retains canonical catalog paths", async () => {
    getDesignBySlug.mockImplementation(async (slug: string) => slug === "keepsake"
        ? {design: {id: "123", slug} as Design} : null);
    const links = await resolveDesignLinks({heading: "More", links: [
        {slug: "self", label: "Self"}, {slug: "keepsake", label: "Quilter T-shirt"},
        {slug: "keepsake", label: "Duplicate"}, {slug: "hidden", label: "Hidden"},
    ]}, "self");
    expect(links).toEqual([{href: "/designs/keepsake", label: "Quilter T-shirt"}]);
    expect(getDesignBySlug.mock.calls).toEqual([["keepsake"], ["hidden"]]);
});

it("does not query the database when no links are configured", async () => {
    expect(await resolveDesignLinks()).toEqual([]);
    expect(getDesignBySlug).not.toHaveBeenCalled();
});
