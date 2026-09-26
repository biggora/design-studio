"use client";

import Link from "next/link";
import { useLastCatalogQuery } from "@/lib/catalog-state";

type BackToCatalogProps = {
  /** Where to go when this tab carries no stored catalog state (direct link, share). */
  fallbackHref: string;
};

/**
 * Returns to the catalog preserving the visitor's last browsing state
 * (search/collection/page), recorded there by <TrackCatalogState />.
 */
export default function BackToCatalog({ fallbackHref }: BackToCatalogProps) {
  const query = useLastCatalogQuery();
  const href = query !== null ? `/designs${query}` : fallbackHref;

  return (
    <Link
      href={href}
      className="text-accent hover:underline mb-4 inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      &larr; Back to Designs
    </Link>
  );
}
