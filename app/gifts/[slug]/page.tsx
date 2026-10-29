import { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getSiteConfig, fetchGiftPageSections } from "@/utils/database";
import { Design } from "@/types/design";
import { DesignCard } from "@/app/components/DesignCard";
import { JsonLd } from "@/app/components/JsonLd";
import { AccentLink } from "@/app/components/AccentLink";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { SectionHeading } from "@/app/components/SectionHeading";
import { CardGrid } from "@/app/components/CardGrid";
import { getShareImageUrl } from "@/lib/image";
import { collectionPath } from "@/lib/collections";
import { getGiftPages, giftPath } from "@/lib/gifts";
import { pageJsonLd, designListElements } from "@/lib/structured-data";
import { getListingTshirtOffers } from "@/lib/marketplace-prices";

const DESIGNS_PER_SECTION = 8;

type Props = {
  params: Promise<{ slug: string }>;
};

// Per-request dedupe: generateMetadata and the page share one set of lookups.
const loadGiftPage = cache(async (slug: string) => {
  const config = await getSiteConfig();
  const page = getGiftPages(config.giftPages).find((item) => item.slug === slug);
  if (!page) return { config, page: null, sections: [] };
  const sections = await fetchGiftPageSections(page, DESIGNS_PER_SECTION);
  return { config, page, sections };
});

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const { config, page, sections } = await loadGiftPage(slug);
  if (!page || !sections.length) {
    return { title: "Gift Ideas Not Found", robots: { index: false, follow: true } };
  }

  const title = `${page.title} - ${config.name}`;
  const canonical = giftPath(page.slug);
  const images = sections.flatMap((section) => section.designs).slice(0, 4).map((design) => getShareImageUrl(design));
  return {
    title,
    description: page.description,
    alternates: { canonical },
    openGraph: {
      url: `https://${config.domain}${canonical}`,
      type: "website",
      title,
      description: page.description,
      images,
    },
    twitter: { title, description: page.description, images },
  };
}

export default async function GiftPage(props: Props) {
  const { slug } = await props.params;
  const { config, page, sections } = await loadGiftPage(slug);
  if (!page || !sections.length) notFound();

  const siteUrl = `https://${config.domain}`;
  const listed: Design[] = [];
  for (const design of sections.flatMap((section) => section.designs)) {
    if (!listed.some((item) => item.id === design.id)) listed.push(design);
  }
  const tshirtOffers = await getListingTshirtOffers(listed);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${siteUrl}${giftPath(page.slug)}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Gift Ideas", item: `${siteUrl}/gifts` },
      { "@type": "ListItem", position: 3, name: page.heading || page.title, item: `${siteUrl}${giftPath(page.slug)}` },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${siteUrl}${giftPath(page.slug)}#items`,
    name: page.heading || page.title,
    numberOfItems: listed.length,
    itemListElement: designListElements(listed, siteUrl, tshirtOffers),
  };

  return (
    <PageShell>
      <JsonLd data={[breadcrumbJsonLd, itemListJsonLd, {
        ...pageJsonLd(config, giftPath(page.slug), page.heading || page.title, "CollectionPage"),
        description: page.description,
        breadcrumb: { "@id": breadcrumbJsonLd["@id"] },
        mainEntity: { "@id": itemListJsonLd["@id"] },
      }]} />
      <PageHeader title={page.heading || page.title} intro={page.intro} />

      {sections.map((section) => (
        <section key={section.collection || "other"} className="mb-10">
          <SectionHeading className="mb-2">{section.heading}</SectionHeading>
          {section.blurb && <p className="text-muted-foreground max-w-3xl mb-4">{section.blurb}</p>}
          <CardGrid className="mb-4">
            {section.designs.map((design: Design) => (
              <DesignCard key={design.id} design={design} tshirtOffer={tshirtOffers.get(design.id)} />
            ))}
          </CardGrid>
          {section.collection && <AccentLink
            href={collectionPath(section.collection)}
            className="inline-flex items-center min-h-11"
          >
            Browse the {section.collection} collection
          </AccentLink>}
        </section>
      ))}

      {page.faq && page.faq.length > 0 && (
        <section className="mb-8">
          <SectionHeading>Questions</SectionHeading>
          {page.faq.map((item) => (
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
