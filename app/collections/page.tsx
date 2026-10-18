import { Metadata } from "next";
import Link from "next/link";
import { getSiteConfig, fetchFeaturedCollections } from "@/utils/database";
import { JsonLd } from "@/app/components/JsonLd";
import { collectionPath } from "@/lib/collections";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig();
  const collections = await fetchFeaturedCollections(config.collectionPages);
  const title = `Collections - ${config.name}`;
  const description = `Browse ${collections.length} ${collections.length === 1 ? "collection" : "collections"} of original print designs, from coding humour to pets, hobbies and holidays.`;
  return {
    title,
    description,
    alternates: { canonical: "/collections" },
    ...(collections.length ? {} : { robots: { index: false, follow: true } }),
    openGraph: { url: `https://${config.domain}/collections`, type: "website", title, description },
    twitter: { title, description },
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
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={[breadcrumbJsonLd, itemListJsonLd]} />
      <h1 className="text-4xl font-bold mb-4 text-foreground">Collections</h1>
      <p className="text-muted-foreground max-w-3xl mb-8">
        Browse every {config.name} theme, from coding humour to pets, hobbies and holidays.
      </p>
      {collections.length > 0 ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {collections.map((collection) => (
            <li key={collection.collection}>
              <Link
                href={collectionPath(collection.collection)}
                className="block h-full rounded-lg border border-input bg-card p-4 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block text-xl font-semibold mb-2 text-foreground">{collection.heading || collection.title}</span>
                <span className="block text-muted-foreground">{collection.description}</span>
                <span className="block text-sm text-muted-foreground mt-2">
                  {collection.total} {collection.total === 1 ? "design" : "designs"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          Collections are coming soon.{" "}
          <Link href="/designs" className="text-accent hover:underline">Browse all prints</Link>
        </p>
      )}
    </div>
  );
}
