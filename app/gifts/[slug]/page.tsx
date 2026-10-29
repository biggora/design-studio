import { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSiteConfig, fetchGiftPageDesigns } from "@/utils/database";
import { DesignCard } from "@/app/components/DesignCard";
import { JsonLd } from "@/app/components/JsonLd";
import { CatalogSearchBar } from "@/app/components/CatalogSearchBar";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { SectionHeading } from "@/app/components/SectionHeading";
import { CardGrid } from "@/app/components/CardGrid";
import { getShareImageUrl } from "@/lib/image";
import { collectionDisplayNames } from "@/lib/collections";
import { getGiftPages, giftPath, GIFT_PAGE_SIZE } from "@/lib/gifts";
import { parsePageParam } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { pageJsonLd, designListElements } from "@/lib/structured-data";
import { getListingTshirtOffers } from "@/lib/marketplace-prices";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{search?: string; collection?: string; page?: string}>;
};

function resultsPath(slug: string, search: string, collection: string, page: number) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (collection) params.set("collection", collection);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `${giftPath(slug)}${query ? `?${query}` : ""}`;
}

// Per-request dedupe: generateMetadata and the page share one set of lookups.
const loadGiftPage = cache(async (slug: string, search: string, collection: string, currentPage: number) => {
  const config = await getSiteConfig();
  const page = getGiftPages(config.giftPages).find((item) => item.slug === slug);
  if (!page) return { config, gift: null, designs: [], total: 0, collections: [], hasDesigns: false, page: 1 };
  return { config, gift: page, ...await fetchGiftPageDesigns(page, {search, collection, page: currentPage}) };
});

async function loadRequest(props: Props) {
  const {slug} = await props.params;
  const params = await props.searchParams ?? {};
  const search = (params.search || "").trim();
  const collection = params.collection || "";
  const data = await loadGiftPage(slug, search, collection, parsePageParam(params.page));
  return {...data, params, search, collection};
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { config, gift, designs, hasDesigns, page, search, collection } = await loadRequest(props);
  if (!gift || !hasDesigns) {
    return { title: "Gift Ideas Not Found", robots: { index: false, follow: true } };
  }

  const title = `${gift.title} - ${config.name}${page > 1 ? ` - Page ${page}` : ""}`;
  const canonical = search || collection ? giftPath(gift.slug) : resultsPath(gift.slug, "", "", page);
  const images = designs.slice(0, 4).map((design) => getShareImageUrl(design));
  return {
    title,
    description: gift.description,
    alternates: { canonical },
    ...(search || collection ? {robots: {index: false, follow: true}} : {}),
    openGraph: {
      url: `https://${config.domain}${canonical}`,
      type: "website",
      title,
      description: gift.description,
      images,
    },
    twitter: { title, description: gift.description, images },
  };
}

export default async function GiftPage(props: Props) {
  const { config, gift, designs, total, collections, hasDesigns, page, search, collection, params } = await loadRequest(props);
  if (!gift || !hasDesigns) notFound();
  if (params.page !== undefined && params.page !== (page > 1 ? String(page) : undefined)) {
    redirect(resultsPath(gift.slug, search, collection, page));
  }

  const siteUrl = `https://${config.domain}`;
  const path = resultsPath(gift.slug, search, collection, page);
  const collectionNames = collectionDisplayNames(config.collectionPages);
  const selectedName = collectionNames.get(collection) ?? collection;
  const tshirtOffers = await getListingTshirtOffers(designs);
  const totalPages = Math.ceil(total / GIFT_PAGE_SIZE);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${siteUrl}${path}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Gift Ideas", item: `${siteUrl}/gifts` },
      { "@type": "ListItem", position: 3, name: gift.heading || gift.title, item: `${siteUrl}${giftPath(gift.slug)}` },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${siteUrl}${path}#items`,
    name: gift.heading || gift.title,
    numberOfItems: total,
    itemListElement: designListElements(designs, siteUrl, tshirtOffers, (page - 1) * GIFT_PAGE_SIZE),
  };

  return (
    <PageShell>
      <JsonLd data={[breadcrumbJsonLd, itemListJsonLd, {
        ...pageJsonLd(config, path, gift.heading || gift.title, search ? "SearchResultsPage" : "CollectionPage"),
        description: gift.description,
        breadcrumb: { "@id": breadcrumbJsonLd["@id"] },
        mainEntity: { "@id": itemListJsonLd["@id"] },
      }]} />
      <PageHeader title={gift.heading || gift.title} intro={gift.intro} />

      <CatalogSearchBar
        basePath={giftPath(gift.slug)}
        searchLabel="Search gift designs"
        searchQuery={search}
        selectedCollection={collection}
        collections={collections.map(value => ({value, label: collectionNames.get(value) ?? value}))}
      />
      <p className="text-sm text-muted-foreground mb-4">
        {total} {total === 1 ? "design" : "designs"}
        {search ? ` matching "${search}"` : ""}
        {collection ? ` in "${selectedName}"` : ""}
      </p>
      {designs.length > 0 ? (
        <CardGrid className="mb-8 grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {designs.map((design, index) => (
            <DesignCard key={design.id} design={design} tshirtOffer={tshirtOffers.get(design.id)}
              compactOnMobile priority={index < 4} showCollection={!collection} collectionLabels={collectionNames} />
          ))}
        </CardGrid>
      ) : (
        <div className="text-center py-16 space-y-6">
          <p className="text-muted-foreground">No designs found. Try adjusting your search or filter.</p>
          <Link href={giftPath(gift.slug)} className={buttonVariants({variant: "outline"})}>Clear search &amp; filters</Link>
        </div>
      )}
      {totalPages > 1 && (
        <nav aria-label="Gift design pages" className="flex justify-center items-center gap-4 mb-8">
          {page > 1 && <Link href={resultsPath(gift.slug, search, collection, page - 1)} className={buttonVariants({size: "sm"})}>Previous</Link>}
          <span>Page {page} of {totalPages}</span>
          {page < totalPages && <Link href={resultsPath(gift.slug, search, collection, page + 1)} className={buttonVariants({size: "sm"})}>Next</Link>}
        </nav>
      )}

      {gift.faq && gift.faq.length > 0 && (
        <section className="mb-8">
          <SectionHeading>Questions</SectionHeading>
          {gift.faq.map((item) => (
            <div key={item.question} className="mb-4 max-w-3xl">
              <h3 className="text-lg font-semibold mb-1 text-foreground">{item.question}</h3>
              <p className="text-muted-foreground">{item.answer}</p>
            </div>
          ))}
        </section>
      )}
    </PageShell>
  );
}
