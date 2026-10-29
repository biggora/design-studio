import { Metadata, type ResolvingMetadata } from "next";
import { getSiteConfig, fetchFeaturedCollections } from "@/utils/database";
import { JsonLd } from "@/app/components/JsonLd";
import { AccentLink } from "@/app/components/AccentLink";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { CardGrid } from "@/app/components/CardGrid";
import { IndexCard } from "@/app/components/IndexCard";
import { collectionPath } from "@/lib/collections";

export async function generateMetadata(_props?: unknown, parent?: ResolvingMetadata): Promise<Metadata> {
  const inherited = await parent;
  const config = await getSiteConfig();
  const collections = await fetchFeaturedCollections(config.collectionPages);
  const title = `Collections - ${config.name}`;
  const description = `Browse ${collections.length} ${collections.length === 1 ? "collection" : "collections"} of original print designs, from coding humour to pets, hobbies and holidays.`;
  return {
    title,
    description,
    alternates: { canonical: "/collections" },
    ...(collections.length ? {} : { robots: { index: false, follow: true } }),
    openGraph: { ...inherited?.openGraph, url: `https://${config.domain}/collections`, type: "website", title, description },
    twitter: { ...inherited?.twitter, title, description },
  };
}

export default async function CollectionsIndex() {
  const config = await getSiteConfig();
  const collections = await fetchFeaturedCollections(config.collectionPages);
  const siteUrl = `https://${config.domain}`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Collections", item: `${siteUrl}/collections` },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: collections.map((collection, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${siteUrl}${collectionPath(collection.collection)}`,
    })),
  };

  return (
    <PageShell>
      <JsonLd data={[breadcrumbJsonLd, itemListJsonLd]} />
      <PageHeader
        title="Collections"
        intro={`Browse every ${config.name} theme, from coding humour to pets, hobbies and holidays.`}
      />
      {collections.length > 0 ? (
        <CardGrid as="ul" columns={3}>
          {collections.map((collection) => (
            <li key={collection.collection}>
              <IndexCard
                href={collectionPath(collection.collection)}
                title={collection.heading || collection.title}
                description={collection.description}
                thumbs={collection.designs}
                meta={`${collection.total} ${collection.total === 1 ? "design" : "designs"}`}
              />
            </li>
          ))}
        </CardGrid>
      ) : (
        <p className="text-muted-foreground">
          Collections are coming soon.{" "}
          <AccentLink href="/designs">Browse all prints</AccentLink>
        </p>
      )}
    </PageShell>
  );
}
