import { Metadata } from "next";
import Link from "next/link";
import { getSiteConfig, fetchDesigns, fetchCollections } from "@/utils/database";
import { Design } from "@/types/design";
import { CatalogSearchBar } from "@/app/components/CatalogSearchBar";
import { DesignCard } from "@/app/components/DesignCard";
import { SiteConfig } from "@/lib/store";

const ITEMS_PER_PAGE = 12;


export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();
  const { designs, total } = await fetchDesigns(1, "", "", ITEMS_PER_PAGE);
  const collections = await fetchCollections();

  return {
    title: `Our Designs - ${config.name}`,
    description: `Explore our unique collection of ${total} print designs across ${collections.length} collections. Each piece is a testament to innovative design and artistic excellence.`,
    keywords: `print designs, textile art, innovative designs, ${config.name} collection, ${collections.join(", ")}`,
    openGraph: {
      url: `https://${config.domain}/designs`,
      type: "website",
      title: `Our Designs - ${config.name}`,
      description: `Explore our unique collection of ${total} designs across ${collections.length} collections. Each piece is a testament to innovative design and artistic excellence.`,
      images: designs.slice(0, 4).map((design) => design.externalImageUrl),
    },
  };
}

export default async function DesignFolio({
  searchParams,
}: {
  searchParams: { page?: string; search?: string; collection?: string };
}) {
  const currentPage = Number(searchParams.page) || 1;
  const searchQuery = searchParams.search || "";
  const selectedCollection = searchParams.collection || "";

  const { designs, total } = await fetchDesigns(
    currentPage,
    searchQuery,
    selectedCollection,
    ITEMS_PER_PAGE,
  );
  const collections = await fetchCollections();
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-4xl font-bold mb-8 text-[#212A31]">Our Designs</h1>

      <CatalogSearchBar
        searchQuery={searchQuery}
        selectedCollection={selectedCollection}
        collections={collections}
      />

      {designs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {designs.map((design: Design) => (
            <DesignCard key={design.id} design={design} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          No designs found. Try adjusting your search or filter.
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center space-x-4 mt-8">
          {currentPage > 1 && (
            <Link
              href={`/designs?page=${currentPage - 1}&search=${searchQuery}&collection=${selectedCollection}`}
              className="bg-[#124E66] text-white px-4 py-2 rounded-md hover:bg-[#2E3944] transition-colors"
            >
              Previous
            </Link>
          )}
          <span className="text-[#212A31]">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link
              href={`/designs?page=${currentPage + 1}&search=${searchQuery}&collection=${selectedCollection}`}
              className="bg-[#124E66] text-white px-4 py-2 rounded-md hover:bg-[#2E3944] transition-colors"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
