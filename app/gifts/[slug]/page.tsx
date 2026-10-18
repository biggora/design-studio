import { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getSiteConfig, fetchDesigns } from "@/utils/database";
import { Design } from "@/types/design";
import { DesignCard } from "@/app/components/DesignCard";
import { JsonLd } from "@/app/components/JsonLd";
import { AccentLink } from "@/app/components/AccentLink";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { SectionHeading } from "@/app/components/SectionHeading";
import { getDesignDisplayImage } from "@/lib/image";
import { designPath } from "@/lib/slug";
import { collectionPath } from "@/lib/collections";
import { getGiftPages, giftPath } from "@/lib/gifts";

const DESIGNS_PER_SECTION = 8;

type Props = {
  params: Promise<{ slug: string }>;
};

// Per-request dedupe: generateMetadata and the page share one set of lookups.
const loadGiftPage = cache(async (slug: string) => {
  const config = await getSiteConfig();
  const page = getGiftPages(config.giftPages).find((item) => item.slug === slug);
  if (!page) return { config, page: null, sections: [] };
  const results = await Promise.all(
    page.sections.map((section) => fetchDesigns(1, "", section.collection, DESIGNS_PER_SECTION)),
  );
  const sections = page.sections
    .map((section, index) => ({ ...section, designs: results[index].designs }))
    .filter((section) => section.designs.length > 0);
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
  const images = sections.flatMap((section) => section.designs).slice(0, 4).map((design) => getDesignDisplayImage(design));
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

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Gift Ideas", item: `${siteUrl}/gifts` },
      { "@type": "ListItem", position: 3, name: page.heading || page.title, item: `${siteUrl}${giftPath(page.slug)}` },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: listed.map((design, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${siteUrl}${designPath(design)}`,
    })),
  };

  return (
    <PageShell>
      <JsonLd data={[breadcrumbJsonLd, itemListJsonLd]} />
      <PageHeader title={page.heading || page.title} intro={page.intro} />

      {sections.map((section) => (
        <section key={section.collection} className="mb-10">
          <SectionHeading className="mb-2">{section.heading}</SectionHeading>
          {section.blurb && <p className="text-muted-foreground max-w-3xl mb-4">{section.blurb}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 mb-4">
            {section.designs.map((design: Design) => (
              <DesignCard key={design.id} design={design} />
            ))}
          </div>
          <AccentLink
            href={collectionPath(section.collection)}
            className="inline-flex items-center min-h-11"
          >
            See all {section.collection} designs
          </AccentLink>
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
