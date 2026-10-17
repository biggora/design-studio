import {CollectionPage, getCollectionPages} from "@/lib/collections";
import {GiftPage, getGiftPages} from "@/lib/gifts";
import type {SiteConfig} from "@/lib/store";

export type SeoCopyPlan = {
    home?: {title?: string; heading?: string; description?: string};
    intro?: string;
    description?: string;
    collectionPages?: CollectionPage[];
    giftPages?: GiftPage[];
};

export type StudioRow = {key: string; value: string};

/** Throws unless every page is structurally valid. */
export function validateSeoCopyPlan(plan: SeoCopyPlan): void {
    if (plan.collectionPages !== undefined
        && (!Array.isArray(plan.collectionPages) || getCollectionPages(plan.collectionPages).length !== plan.collectionPages.length)) {
        throw new Error("Invalid collectionPages in plan");
    }
    if (plan.giftPages !== undefined
        && (!Array.isArray(plan.giftPages) || getGiftPages(plan.giftPages).length !== plan.giftPages.length)) {
        throw new Error("Invalid giftPages in plan");
    }
}

/** Sorted, deduplicated collection names the plan references that the site DB does not have. */
export function unknownCollections(plan: SeoCopyPlan, known: ReadonlySet<string>): string[] {
    const names = [
        ...(plan.collectionPages ?? []).map(page => page.collection),
        ...(plan.giftPages ?? []).flatMap(page => page.sections.map(section => section.collection)),
    ];
    return [...new Set(names.filter(name => !known.has(name)))].sort();
}

/** Studio rows for the fields present in the plan; arrays are stored as JSON text. */
export function buildStudioRows(plan: SeoCopyPlan): StudioRow[] {
    const rows: StudioRow[] = [];
    for (const field of ["title", "heading", "description"] as const) {
        const value = plan.home?.[field];
        if (value !== undefined) rows.push({key: `home.${field}`, value});
    }
    if (plan.intro !== undefined) rows.push({key: "intro", value: plan.intro});
    if (plan.description !== undefined) rows.push({key: "description", value: plan.description});
    if (plan.collectionPages !== undefined) rows.push({key: "collectionPages", value: JSON.stringify(plan.collectionPages)});
    if (plan.giftPages !== undefined) rows.push({key: "giftPages", value: JSON.stringify(plan.giftPages)});
    return rows;
}

/** Current value of a studio key as the text that would be stored, or undefined when unset. */
export function currentStudioValue(config: SiteConfig, key: string): string | undefined {
    const value: unknown = key.startsWith("home.")
        ? config.home?.[key.slice(5) as "title" | "heading" | "description"]
        : (config as unknown as Record<string, unknown>)[key];
    if (value === undefined || value === null) return undefined;
    return typeof value === "string" ? value : JSON.stringify(value);
}

const short = (value: string): string => value.length > 80 ? `${value.slice(0, 77)}...` : value;

function describe(key: string, value: string | undefined): string | number | null {
    if (value === undefined) return null;
    if (key === "collectionPages") return getCollectionPages(value).length;
    if (key === "giftPages") return getGiftPages(value).length;
    return short(value);
}

/** A row is unchanged when its normalized stored text already equals the new text. */
export function isChanged(row: StudioRow, config: SiteConfig): boolean {
    const old = currentStudioValue(config, row.key);
    if (old === undefined) return true;
    if (row.key === "collectionPages" || row.key === "giftPages") {
        const parse = (text: string): unknown => { try { return JSON.parse(text); } catch { return text; } };
        return JSON.stringify(parse(old)) !== JSON.stringify(parse(row.value));
    }
    return old !== row.value;
}

export function summarizeRows(rows: StudioRow[], config: SiteConfig) {
    return rows.map(row => ({
        key: row.key,
        status: isChanged(row, config) ? "changed" : "unchanged",
        old: describe(row.key, currentStudioValue(config, row.key)),
        new: describe(row.key, row.value),
    }));
}
