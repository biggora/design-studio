import { Metadata } from "next";
import Link from "next/link";
import { getSiteConfig, fetchDesigns, fetchCollections } from "@/utils/database";
import { Design } from "@/types/design";
import { CatalogSearchBar } from "@/app/components/CatalogSearchBar";
import { DesignCard } from "@/app/components/DesignCard";
import { buttonVariants } from "@/components/ui/button";
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

export default async function DesignFolio(
  props: {
    searchParams: Promise<{ page?: string; search?: string; collection?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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

  const createPageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    params.set("page", targetPage.toString());
    if (searchQuery) params.set("search", searchQuery);
    if (selectedCollection) params.set("collection", selectedCollection);
    return `/designs?${params.toString()}`;
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-4xl font-bold mb-8 text-foreground">Our Designs</h1>

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
              href={createPageUrl(currentPage - 1)}
              className={buttonVariants({ size: "sm" })}
            >
              Previous
            </Link>
          )}
          <span className="text-foreground">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link
              href={createPageUrl(currentPage + 1)}
              className={buttonVariants({ size: "sm" })}
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
