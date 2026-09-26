import { useSyncExternalStore } from "react";

const STORAGE_KEY = "catalog:last";

const noopSubscribe = () => () => {};

function getSnapshot(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The catalog's query string ("?..." or "") as last browsed in this tab,
 * or null when nothing was stored. Server snapshot is null, so the first
 * render matches SSR and the stored value applies right after hydration.
 */
export function useLastCatalogQuery(): string | null {
  return useSyncExternalStore(noopSubscribe, getSnapshot, () => null);
}
