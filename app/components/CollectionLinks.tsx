import Link from "next/link";
import {FeaturedCollection} from "@/utils/database";
import {collectionPath} from "@/lib/collections";

export function CollectionLinks({collections, selected = ""}: {collections: FeaturedCollection[]; selected?: string}) {
  if (!collections.length) return null;
  return (
    <nav aria-label="Browse by interest" className="mb-8">
      <h2 className="text-xl font-semibold text-foreground mb-3">Browse by interest</h2>
      <ul className="flex flex-wrap gap-3">
        {collections.map(collection => (
          <li key={collection.collection}>
            <Link href={collectionPath(collection.collection)}
              aria-current={selected === collection.collection ? "page" : undefined}
              className="inline-block border border-input rounded-md px-3 py-2 text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {collection.heading || collection.title} <span className="text-muted-foreground">({collection.total})</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
