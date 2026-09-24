"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

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

    const query = params.toString();
    startTransition(() => {
      router.push(query ? `/designs?${query}` : "/designs");
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
          <Input
            type="text"
            name="search"
            placeholder="Search designs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
            aria-label="Search designs"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-accent"
            aria-label="Submit search"
          >
            <Search size={20} />
          </button>
        </div>
      </form>
      <Select
        name="collection"
        value={collection}
        onChange={handleCollectionChange}
        className="w-full md:w-auto"
      >
        <option value="">All Collections</option>
        {collections.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    </div>
  );
}
