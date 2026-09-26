"use client";

import { useEffect } from "react";

const STORAGE_KEY = "catalog:last";

/**
 * Invisible companion of the catalog page: remembers the catalog's current
 * query (search/collection/page) for the session, so detail pages can send
 * the visitor back to the exact browsing state.
 */
export default function TrackCatalogState() {
  // No dep array: runs on every catalog render, so client-side navigation
  // between filter states keeps the stored query current.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, window.location.search);
    } catch {}
  });
  return null;
}
