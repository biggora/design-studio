export type CollectionPage = {
    collection: string;
    title: string;
    heading?: string;
    description: string;
    intro: string;
};

export function collectionPath(title: string, page = 1): string {
    const params = new URLSearchParams({collection: title});
    if (page > 1) params.set("page", String(page));
    return `/designs?${params}`;
}

/** studio.value is text; config.json may provide the same setting as an array. */
export function getCollectionPages(value: unknown): CollectionPage[] {
    if (typeof value === "string") {
        try { value = JSON.parse(value); } catch { return []; }
    }
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.filter((page): page is CollectionPage => {
        if (!page || (page.heading !== undefined && (typeof page.heading !== "string" || !page.heading.trim()))
            || !["collection", "title", "description", "intro"].every(key =>
            typeof page[key] === "string" && page[key].trim()) || seen.has(page.collection)) return false;
        seen.add(page.collection);
        return true;
    });
}

export function curatedCollectionTitles(props: unknown): string[] {
    const value = (props as {curatedCollections?: unknown} | null)?.curatedCollections;
    return Array.isArray(value)
        ? [...new Set(value.filter((title): title is string => typeof title === "string" && !!title.trim()))]
        : [];
}
