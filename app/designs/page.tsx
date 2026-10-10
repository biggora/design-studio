import { Metadata } from "next";
import {cache} from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSiteConfig, fetchDesigns, fetchFeedCollections, fetchFeaturedCollections } from "@/utils/database";
import { Design } from "@/types/design";
import { CatalogSearchBar } from "@/app/components/CatalogSearchBar";
import { DesignCard } from "@/app/components/DesignCard";
import { getDesignDisplayImage } from "@/lib/image";
import TrackCatalogState from "@/app/components/TrackCatalogState";
import { buttonVariants } from "@/components/ui/button";
import { parsePageParam } from "@/lib/utils";
import {getCollectionPages} from "@/lib/collections";
import {CollectionLinks} from "@/app/components/CollectionLinks";

const ITEMS_PER_PAGE = 15;

const loadCatalog = cache(async (page: number, search: string, collection: string) => {
  const [config, result, collections] = await Promise.all([
    getSiteConfig(), fetchDesigns(page, search, collection, ITEMS_PER_PAGE), fetchFeedCollections(),
  ]);
  const theme = collections.find(item => item.title === collection);
  const prepared = getCollectionPages(config.collectionPages).find(item => item.collection === collection);
  const featuredCollections = await fetchFeaturedCollections(config.collectionPages);
  return {config, ...result, collections, featuredCollections,
    heading: theme ? prepared?.heading || prepared?.title || theme.title : "Our Designs",
    metadataTitle: theme ? prepared?.title || theme.title : "Our Designs",
    intro: theme ? prepared?.intro || theme.description : "",
    description: theme ? prepared?.description || theme.description : "",
    knownCollection: !!theme};
});

export async function generateMetadata(
  props: {
    searchParams: Promise<{ page?: string; search?: string; collection?: string }>;
  }
): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const currentPage = parsePageParam(searchParams.page);
  const searchQuery = searchParams.search || "";
  const selectedCollection = searchParams.collection || "";

  const {config, designs, total, collections, metadataTitle, description: collectionDescription, knownCollection} =
    await loadCatalog(currentPage, searchQuery, selectedCollection);

  const titleBase = `${metadataTitle} - ${config.name}`;
  const title = currentPage > 1 ? `${titleBase} - Page ${currentPage}` : titleBase;
  const description = collectionDescription || `Browse ${total} print designs across ${collections.length} collections. Find artwork by interest and open a design to explore available products.`;

  const canonicalParams = new URLSearchParams();
  if (selectedCollection) canonicalParams.set("collection", selectedCollection);
  if (currentPage > 1) canonicalParams.set("page", currentPage.toString());
  const canonicalQuery = canonicalParams.toString();
  const canonical = canonicalQuery ? `/designs?${canonicalQuery}` : "/designs";

  return {
    title,
    description,
    alternates: { canonical },
    ...(searchQuery || (selectedCollection && (!knownCollection || !total))
      ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      url: `https://${config.domain}${canonical}`,
      type: "website",
      title,
      description,
      images: designs.slice(0, 4).map((design) => getDesignDisplayImage(design)),
    },
    twitter: {
      title,
      description,
      images: designs.slice(0, 4).map((design) => getDesignDisplayImage(design)),
    },
  };
}

export default async function DesignFolio(
  props: {
    searchParams: Promise<{ page?: string; search?: string; collection?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const currentPage = parsePageParam(searchParams.page);
  const searchQuery = searchParams.search || "";
  const selectedCollection = searchParams.collection || "";

  const {designs, total, collections, featuredCollections, heading, intro} =
    await loadCatalog(currentPage, searchQuery, selectedCollection);
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const createPageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    if (selectedCollection) params.set("collection", selectedCollection);
    if (targetPage > 1) params.set("page", targetPage.toString());
    if (searchQuery) params.set("search", searchQuery);
    const query = params.toString();
    return query ? `/designs?${query}` : "/designs";
  };

  const targetPage = totalPages > 0 ? Math.min(currentPage, totalPages) : 1;
  const canonicalPageParam = targetPage === 1 ? undefined : String(targetPage);
  if (searchParams.page !== undefined && searchParams.page !== canonicalPageParam) {
    redirect(createPageUrl(targetPage));
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <TrackCatalogState />
      <h1 className="text-4xl font-bold mb-4 text-foreground">{heading}</h1>
      {intro && <p className="text-muted-foreground max-w-3xl mb-6">{intro}</p>}

      <CatalogSearchBar
        searchQuery={searchQuery}
        selectedCollection={selectedCollection}
        collections={collections.map(collection => collection.title)}
      />
      {!selectedCollection && <CollectionLinks collections={featuredCollections} />}

      {designs.length > 0 && (
        <p className="text-sm text-muted-foreground mb-4">
          {total} {total === 1 ? "design" : "designs"}
          {searchQuery ? ` matching "${searchQuery}"` : ""}
          {selectedCollection ? ` in "${selectedCollection}"` : ""}
        </p>
      )}

      {designs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 mb-8">
          {designs.map((design: Design) => (
            <DesignCard key={design.id} design={design} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 space-y-6">
          <p className="text-muted-foreground">
            No designs found
            {searchQuery ? ` for "${searchQuery}"` : ""}
            {selectedCollection ? ` in "${selectedCollection}"` : ""}. Try
            adjusting your search or filter.
          </p>
          {(searchQuery || selectedCollection) && (
            <Link
              href="/designs"
              className={buttonVariants({ variant: "outline" })}
            >
              Clear search &amp; filters
            </Link>
          )}
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
      {selectedCollection && <div className="mt-8"><CollectionLinks collections={featuredCollections} selected={selectedCollection} /></div>}
    </div>
  );
}
