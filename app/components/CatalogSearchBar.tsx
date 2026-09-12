"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

type CatalogSearchBarProps = {
  searchQuery: string;
  selectedCollection: string;
  collections: string[];
};

export function CatalogSearchBar({
  searchQuery,
  selectedCollection,
  collections,
}: CatalogSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(searchQuery);
  const [collection, setCollection] = useState(selectedCollection);

  useEffect(() => {
    setSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setCollection(selectedCollection);
  }, [selectedCollection]);

  const updateFilters = (newSearch: string, newCollection: string) => {
    const params = new URLSearchParams();

    const trimmedSearch = newSearch.trim();
    if (trimmedSearch) {
      params.set("search", trimmedSearch);
    }

    if (newCollection) {
      params.set("collection", newCollection);
    }

    params.set("page", "1");

    startTransition(() => {
      router.push(`/designs?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    updateFilters(search, collection);
  };

  const handleCollectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCollection = e.target.value;
    setCollection(newCollection);
    updateFilters(search, newCollection);
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 mb-8">
      <form onSubmit={handleSearchSubmit} className="flex-grow">
        <div className="relative">
          <input
            type="text"
            name="search"
            placeholder="Search designs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
        value={collection}
        onChange={handleCollectionChange}
        className="px-4 py-2 rounded-md border border-[#748D92] focus:outline-none focus:ring-2 focus:ring-[#124E66] bg-white"
      >
        <option value="">All Collections</option>
        {collections.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
