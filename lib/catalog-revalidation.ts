import { revalidatePath } from "next/cache";

/**
 * Drops the cached pages whose content comes from the design catalog (home,
 * catalog, collection and gift pages, design/share pages, the sitemap) after a
 * publish, an activation change or a background change. Pages that only read
 * the site config (about, services, contact, legal) and the layout are left
 * alone: they follow `/api/revalidate/config` and the hourly safety TTL, so a
 * publish no longer rewrites the whole site in the ISR cache.
 */
export function revalidateCatalogPages(): void {
  for (const path of ["/", "/designs", "/collections", "/gifts", "/sitemap.xml"]) {
    revalidatePath(path);
  }
  for (const route of ["/designs/[slug]", "/gifts/[slug]", "/p/[slug]"]) {
    revalidatePath(route, "page");
  }
}
