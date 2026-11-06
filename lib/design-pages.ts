import {SLUG_PATTERN} from "@/lib/slug";

export type DesignLink = {slug: string; label: string};
export type DesignLinkSection = {heading: string; intro?: string; links: DesignLink[]};

/** Editorial copy, separate from marketplace identities and frozen share images. */
export type DesignPage = {
    slug: string;
    title: string;
    heading: string;
    description: string;
    intro: string;
    imageAlt: string;
    buyingInfo?: string;
    related?: DesignLinkSection;
};

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";
const filled = (value: unknown): value is string => typeof value === "string" && !!value.trim();
const validSlug = (value: unknown): value is string => typeof value === "string" && value.length <= 255 && SLUG_PATTERN.test(value);

export function isDesignLinkSection(value: unknown): value is DesignLinkSection {
    return record(value) && filled(value.heading) && (value.intro === undefined || filled(value.intro))
        && Array.isArray(value.links) && value.links.length > 0
        && value.links.every(link => record(link) && validSlug(link.slug) && filled(link.label));
}

/** Same array / studio JSON-text convention as collectionPages and giftPages. */
export function getDesignPages(value: unknown): DesignPage[] {
    if (typeof value === "string") {
        try { value = JSON.parse(value); } catch { return []; }
    }
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.filter((page): page is DesignPage => {
        if (!record(page) || !validSlug(page.slug) || seen.has(page.slug)
            || ![page.title, page.heading, page.description, page.intro, page.imageAlt].every(filled)
            || (page.buyingInfo !== undefined && !filled(page.buyingInfo))
            || (page.related !== undefined && !isDesignLinkSection(page.related))) return false;
        seen.add(page.slug);
        return true;
    });
}
