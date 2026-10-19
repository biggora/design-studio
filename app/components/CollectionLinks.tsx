import { ChevronDown } from "lucide-react";
import { FeaturedCollection } from "@/utils/database";
import { collectionPath } from "@/lib/collections";
import { LinkChip } from "@/app/components/LinkChip";
import { SectionHeading } from "@/app/components/SectionHeading";

type CollectionLinksProps = {
  collections: FeaturedCollection[];
  selected?: string;
  /** Cap the always-visible chips at the curated head; the rest collapse
      into a native disclosure so the catalog grid stays on the first screen
      (every link stays in the DOM for crawlers either way). */
  limit?: number;
};

function CollectionChip({ collection, selected }: { collection: FeaturedCollection; selected: string }) {
  return (
    <LinkChip href={collectionPath(collection.collection)} selected={selected === collection.collection}>
      {collection.heading || collection.title}
      <span className="ml-1 tabular-nums text-muted-foreground">({collection.total})</span>
    </LinkChip>
  );
}

export function CollectionLinks({collections, selected = "", limit}: CollectionLinksProps) {
  if (!collections.length) return null;

  const visible = limit ? collections.slice(0, limit) : collections;
  const collapsed = limit ? collections.slice(limit) : [];

  return (
    <nav aria-label="Browse by interest" className="mb-8">
      <SectionHeading className="text-xl mb-3">Browse by interest</SectionHeading>
      <ul className="flex flex-wrap gap-3">
        {visible.map((collection) => (
          <li key={collection.collection}>
            <CollectionChip collection={collection} selected={selected} />
          </li>
        ))}
      </ul>
      {collapsed.length > 0 && (
        <details className="group mt-3">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            Browse all {collections.length} interests
            <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-3 flex flex-wrap gap-3">
            {collapsed.map((collection) => (
              <li key={collection.collection}>
                <CollectionChip collection={collection} selected={selected} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </nav>
  );
}
