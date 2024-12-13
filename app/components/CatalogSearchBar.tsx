"use client";

import { Search } from "lucide-react";

type CatalogSearchBarProps = {
  searchQuery: string;
  selectedCollection: string;
  collections: string[];
};

export function CatalogSearchBar({
  searchQuery,
  collections,
  selectedCollection,
}: CatalogSearchBarProps) {
  return (
    <div className="flex flex-col md:flex-row gap-4 mb-8">
      <form action="/designs" method="GET" className="flex-grow">
        <div className="relative">
          <input
            type="text"
            name="search"
            placeholder="Search designs..."
            defaultValue={searchQuery}
            className="w-full px-4 py-2 pr-10 rounded-md border border-[#748D92] focus:outline-none focus:ring-2 focus:ring-[#124E66]"
            aria-label="Search designs"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[#748D92] hover:text-[#124E66]"
            aria-label="Submit search"
          >
            <Search size={20} />
          </button>
        </div>
      </form>
      <select
        name="collection"
        onChange={(e) => {
          const url = new URL(window.location.href);
          url.searchParams.set("collection", e.target.value);
          url.searchParams.set("page", "1");
          window.location.href = url.toString();
        }}
        defaultValue={selectedCollection}
        className="px-4 py-2 rounded-md border border-[#748D92] focus:outline-none focus:ring-2 focus:ring-[#124E66] bg-white"
      >
        <option value="">All Collections</option>
        {collections.map((collection) => (
          <option key={collection} value={collection}>
            {collection}
          </option>
        ))}
      </select>
    </div>
  );
}
