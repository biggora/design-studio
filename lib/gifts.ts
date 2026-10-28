import {isGiftTopic, type GiftTopic} from "@/lib/gift-selection";

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
    /** Explicit selection topic; built-in slugs have defaults. Unknown slugs must set one. */
    topic?: GiftTopic;
    title: string;
    heading?: string;
    description: string;
    intro: string;
    sections: GiftSection[];
    faq?: GiftFaq[];
    /** Optional "MM-DD" window (may wrap the year end) in which the page is promoted. */
    season?: {start: string; end: string};
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

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function validSeason(season: unknown): boolean {
    return season === undefined || (isRecord(season) && typeof season.start === "string" && MONTH_DAY.test(season.start)
        && typeof season.end === "string" && MONTH_DAY.test(season.end));
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
            || (page.topic !== undefined && !isGiftTopic(page.topic))
            || !Array.isArray(page.sections) || !page.sections.length || !page.sections.every(validSection)
            || !validSeason(page.season) || (page.faq !== undefined && (!Array.isArray(page.faq) || !page.faq.every(validFaq)))) return false;
        seen.add(page.slug);
        return true;
    });
}

const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]; // non-leap year
const CYCLE = 365;

/** Zero-based day of a non-leap year; 02-29 counts as 02-28. */
function dayOfYear(month: number, day: number): number {
    return DAYS_BEFORE_MONTH[month - 1] + Math.min(day, month === 2 ? 28 : 31) - 1;
}

const seasonDay = (value: string): number => dayOfYear(Number(value.slice(0, 2)), Number(value.slice(3)));
const daysUntil = (from: number, to: number): number => (to - from + CYCLE) % CYCLE;

/**
 * Seasonal order: pages in season first (nearest end first), then pages without a season
 * in config order, then out-of-season pages (nearest start first). Ties keep config order.
 */
export function orderGiftPages(pages: GiftPage[], now: Date = new Date()): GiftPage[] {
    const today = dayOfYear(now.getUTCMonth() + 1, now.getUTCDate());
    const rank = (page: GiftPage): [number, number] => {
        if (!page.season) return [1, 0];
        const start = seasonDay(page.season.start);
        const end = seasonDay(page.season.end);
        const inSeason = start <= end ? today >= start && today <= end : today >= start || today <= end;
        return inSeason ? [0, daysUntil(today, end)] : [2, daysUntil(today, start)];
    };
    return pages
        .map((page, index) => ({page, index, key: rank(page)}))
        .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.index - b.index)
        .map(entry => entry.page);
}
