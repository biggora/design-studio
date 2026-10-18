import { Metadata } from "next";
import Link from "next/link";
import { getSiteConfig, fetchLiveGiftPages } from "@/utils/database";
import { JsonLd } from "@/app/components/JsonLd";
import { AccentLink } from "@/app/components/AccentLink";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { giftPath, orderGiftPages } from "@/lib/gifts";

const DESCRIPTION = "Gift ideas by interest: find a print for the programmer, pet lover, photographer or traveller in your life.";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig();
  const title = `Gift Ideas by Interest - ${config.name}`;
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: "/gifts" },
    ...((await fetchLiveGiftPages(config.giftPages)).length ? {} : { robots: { index: false, follow: true } }),
    openGraph: { url: `https://${config.domain}/gifts`, type: "website", title, description: DESCRIPTION },
    twitter: { title, description: DESCRIPTION },
  };
}

export default async function GiftsIndex() {
  const config = await getSiteConfig();
  const pages = orderGiftPages(await fetchLiveGiftPages(config.giftPages));
  const siteUrl = `https://${config.domain}`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Gift Ideas", item: `${siteUrl}/gifts` },
    ],
  };

  return (
    <PageShell>
      <JsonLd data={breadcrumbJsonLd} />
      <PageHeader
        title="Gift Ideas by Interest"
        intro="Pick an interest to see prints that suit the person you are shopping for."
      />
      {pages.length > 0 ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {pages.map((page) => (
            <li key={page.slug}>
              <Link
                href={giftPath(page.slug)}
                className="block h-full rounded-lg border border-input bg-card p-4 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block text-xl font-semibold mb-2 text-foreground">{page.heading || page.title}</span>
                <span className="block text-muted-foreground">{page.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          Gift ideas are coming soon.{" "}
          <AccentLink href="/designs">Browse all prints</AccentLink>
        </p>
      )}
    </PageShell>
  );
}
