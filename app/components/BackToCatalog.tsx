"use client";

import { AccentLink } from "@/app/components/AccentLink";
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
    <AccentLink href={href} className="mb-4 inline-block">
      &larr; Back to Designs
    </AccentLink>
  );
}
