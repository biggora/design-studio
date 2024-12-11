"use client";

import Image from "next/image";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/utils/supabase";
import { Print } from "@/types/print";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useSiteConfigStore } from "@/lib/store";
import { printCardHeight, printCardWidth } from "@/lib/image";

const ITEMS_PER_PAGE = 12;

async function getPrints(
  page: number,
  searchQuery: string,
  collection: string,
): Promise<{ prints: Print[]; total: number }> {
  const start = (page - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE - 1;

  let query = supabase.from("prints").select("*", { count: "exact" });

  if (searchQuery) {
    query = query.ilike("title", `%${searchQuery}%`);
  }

  if (collection) {
    query = query.eq("collection", collection);
  }

  const { data, error, count } = await query.range(start, end);

  if (error) {
    console.error("Error fetching prints:", error);
    return { prints: [], total: 0 };
  }

  return { prints: data || [], total: count || 0 };
}

async function fetchCollections() {
  const { data, error } = await supabase
    .from("prints")
    .select("collection")
    .not("collection", "is", null);

  if (error) {
    console.error("Error fetching collections:", error);
    return [];
  }

  let uniqueCollections: string[];
  uniqueCollections = Array.from(
    new Set(data.map((item) => item.collection)),
  ) as string[];
  return uniqueCollections;
}

export default function PrintFolio({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const { config } = useSiteConfigStore();
  const [prints, setPrints] = useState<Print[]>([]);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(
    Number(searchParams.page) || 1,
  );
  const [selectedCollection, setSelectedCollection] = useState("");
  const [collections, setCollections] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const { prints, total } = await getPrints(
        currentPage,
        searchQuery,
        selectedCollection,
      );
      setPrints(prints);
      setTotal(total);

      const collectionsData = await fetchCollections();
      setCollections(collectionsData);
      setIsLoading(false);
    }

    fetchData();
  }, [currentPage, searchQuery, selectedCollection]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  const handleCollectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCollection(e.target.value);
    setCurrentPage(1);
  };

  return (
    <>
      <Helmet>
        <title>Our Prints - {config.name}</title>
        <meta
          name="description"
          content="Explore our unique collection of thread-based prints. Each piece is a testament to innovative design and artistic excellence."
        />
        <meta
          name="keywords"
          content={`thread prints, textile art, innovative designs, ${config.name} collection`}
        />
      </Helmet>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold mb-8 text-[#212A31]">Our Prints</h1>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <form onSubmit={handleSearch} className="flex-grow">
            <div className="relative">
              <input
                type="text"
                placeholder="Search prints..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pr-10 rounded-md border border-[#748D92] focus:outline-none focus:ring-2 focus:ring-[#124E66]"
                aria-label="Search prints"
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
            value={selectedCollection}
            onChange={handleCollectionChange}
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

        {isLoading ? (
          <div className="text-center py-8">Loading...</div>
        ) : prints.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {prints.map((print: Print) => (
              <div
                key={print.id}
                className="bg-white shadow-md rounded-lg overflow-hidden flex flex-col"
              >
                <Image
                  src={decodeURIComponent(
                    print.externalImageUrl || "/placeholder.svg",
                  )}
                  alt={print.title}
                  width={printCardWidth}
                  height={printCardHeight}
                  className={`w-full h-[${printCardWidth}px] object-cover`}
                />
                <div className="p-4 flex flex-col flex-grow">
                  <h2 className="text-xl font-semibold mb-2 text-[#212A31]">
                    {print.title}
                  </h2>
                  <p className="text-[#748D92] mb-4">{print.description}</p>
                  <p className="text-[#748D92] mb-2">
                    Collection: {print.collection}
                  </p>
                  <Link
                    href={`/prints/${print.id}`}
                    className="text-[#124E66] hover:underline mt-auto"
                  >
                    View Print Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            No prints found. Try adjusting your search or filter.
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center items-center space-x-4 mt-8">
            {currentPage > 1 && (
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                className="bg-[#124E66] text-white px-4 py-2 rounded-md hover:bg-[#2E3944] transition-colors"
              >
                Previous
              </button>
            )}
            <span className="text-[#212A31]">
              Page {currentPage} of {totalPages}
            </span>
            {currentPage < totalPages && (
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                className="bg-[#124E66] text-white px-4 py-2 rounded-md hover:bg-[#2E3944] transition-colors"
              >
                Next
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
