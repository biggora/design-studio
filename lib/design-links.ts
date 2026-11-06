import {getDesignBySlug} from "@/utils/database";
import {designPath} from "@/lib/slug";
import type {DesignLinkSection} from "@/lib/design-pages";

export type ResolvedDesignLink = {href: string; label: string};

/** Resolve through the active catalog so hidden or removed designs leave no links. */
export async function resolveDesignLinks(section?: DesignLinkSection, currentSlug?: string): Promise<ResolvedDesignLink[]> {
    const seen = new Set<string>();
    const links = (section?.links ?? []).filter(link => {
        if (link.slug === currentSlug || seen.has(link.slug)) return false;
        seen.add(link.slug);
        return true;
    });
    const results = await Promise.all(links.map(async link => {
        const result = await getDesignBySlug(link.slug);
        return result ? {href: designPath(result.design), label: link.label} : null;
    }));
    return results.filter((link): link is ResolvedDesignLink => link !== null);
}
