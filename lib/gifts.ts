export type GiftSection = {
    collection: string;
    heading: string;
    blurb?: string;
};

export type GiftFaq = {
    question: string;
    answer: string;
};

export type GiftPage = {
    slug: string;
    title: string;
    heading?: string;
    description: string;
    intro: string;
    sections: GiftSection[];
    faq?: GiftFaq[];
};

export function giftPath(slug: string): string {
    return `/gifts/${slug}`;
}

const filled = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";
const optionalFilled = (value: unknown): boolean => value === undefined || filled(value);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";

function validSection(section: unknown): boolean {
    return isRecord(section) && filled(section.collection) && filled(section.heading) && optionalFilled(section.blurb);
}

function validFaq(item: unknown): boolean {
    return isRecord(item) && filled(item.question) && filled(item.answer);
}

/** studio.value is text; config.json may provide the same setting as an array. */
export function getGiftPages(value: unknown): GiftPage[] {
    if (typeof value === "string") {
        try { value = JSON.parse(value); } catch { return []; }
    }
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.filter((page): page is GiftPage => {
        if (!isRecord(page) || typeof page.slug !== "string" || !/^[a-z0-9-]+$/.test(page.slug) || seen.has(page.slug)
            || !filled(page.title) || !filled(page.description) || !filled(page.intro) || !optionalFilled(page.heading)
            || !Array.isArray(page.sections) || !page.sections.length || !page.sections.every(validSection)
            || (page.faq !== undefined && (!Array.isArray(page.faq) || !page.faq.every(validFaq)))) return false;
        seen.add(page.slug);
        return true;
    });
}
