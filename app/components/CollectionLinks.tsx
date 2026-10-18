import { FeaturedCollection } from "@/utils/database";
import { collectionPath } from "@/lib/collections";
import { LinkChip } from "@/app/components/LinkChip";
import { SectionHeading } from "@/app/components/SectionHeading";

export function CollectionLinks({collections, selected = ""}: {collections: FeaturedCollection[]; selected?: string}) {
  if (!collections.length) return null;
  return (
    <nav aria-label="Browse by interest" className="mb-8">
      <SectionHeading className="text-xl mb-3">Browse by interest</SectionHeading>
      <ul className="flex flex-wrap gap-3">
        {collections.map(collection => (
          <li key={collection.collection}>
            <LinkChip
              href={collectionPath(collection.collection)}
              selected={selected === collection.collection}
            >
              {collection.heading || collection.title} <span className="text-muted-foreground">({collection.total})</span>
            </LinkChip>
          </li>
        ))}
      </ul>
    </nav>
  );
}
