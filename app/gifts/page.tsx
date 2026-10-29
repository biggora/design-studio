import { Metadata, type ResolvingMetadata } from "next";
import { getSiteConfig, fetchLiveGiftPages, fetchGiftPageSections } from "@/utils/database";
import { JsonLd } from "@/app/components/JsonLd";
import { AccentLink } from "@/app/components/AccentLink";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { CardGrid } from "@/app/components/CardGrid";
import { IndexCard } from "@/app/components/IndexCard";
import { giftPath, orderGiftPages } from "@/lib/gifts";
import { pageJsonLd } from "@/lib/structured-data";

const DESCRIPTION = "Gift ideas by interest: find a print for the programmer, pet lover, photographer or traveller in your life.";

export async function generateMetadata(_props?: unknown, parent?: ResolvingMetadata): Promise<Metadata> {
  const inherited = await parent;
  const config = await getSiteConfig();
  const title = `Gift Ideas by Interest - ${config.name}`;
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: "/gifts" },
    ...((await fetchLiveGiftPages(config.giftPages)).length ? {} : { robots: { index: false, follow: true } }),
    openGraph: { ...inherited?.openGraph, url: `https://${config.domain}/gifts`, type: "website", title, description: DESCRIPTION },
    twitter: { ...inherited?.twitter, title, description: DESCRIPTION },
  };
}

export default async function GiftsIndex() {
  const config = await getSiteConfig();
  const ordered = orderGiftPages(await fetchLiveGiftPages(config.giftPages));
  // Use the same eligible prints as the destination, including when its first section is empty.
  const pages = await Promise.all(ordered.map(async (page) => ({
    ...page,
    thumbs: (await fetchGiftPageSections(page, 3)).flatMap(section => section.designs).slice(0, 3),
  })));
  const siteUrl = `https://${config.domain}`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${siteUrl}/gifts#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Gift Ideas", item: `${siteUrl}/gifts` },
    ],
  };

  return (
    <PageShell>
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={{
        ...pageJsonLd(config, "/gifts", "Gift Ideas by Interest", "CollectionPage"),
        description: DESCRIPTION,
        breadcrumb: { "@id": breadcrumbJsonLd["@id"] },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: pages.length,
          itemListElement: pages.map((page, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: page.heading || page.title,
            url: `${siteUrl}${giftPath(page.slug)}`,
          })),
        },
      }} />
      <PageHeader
        title="Gift Ideas by Interest"
        intro="Pick an interest to see prints that suit the person you are shopping for."
      />
      {pages.length > 0 ? (
        <CardGrid as="ul" columns={3}>
          {pages.map((page) => (
            <li key={page.slug}>
              <IndexCard
                href={giftPath(page.slug)}
                title={page.heading || page.title}
                description={page.description}
                thumbs={page.thumbs}
              />
            </li>
          ))}
        </CardGrid>
      ) : (
        <p className="text-muted-foreground">
          Gift ideas are coming soon.{" "}
          <AccentLink href="/designs">Browse all prints</AccentLink>
        </p>
      )}
    </PageShell>
  );
}
