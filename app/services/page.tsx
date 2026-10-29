import { JsonLd } from "@/app/components/JsonLd";
import { pageJsonLd } from "@/lib/structured-data";
import { Metadata, type ResolvingMetadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { getSiteConfig } from "@/utils/database";
import { SiteConfig } from "@/lib/store";
import { buttonVariants } from "@/components/ui/button";
import { AccentLink } from "@/app/components/AccentLink";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { SectionHeading } from "@/app/components/SectionHeading";
import { CardGrid } from "@/app/components/CardGrid";

export async function generateMetadata(_props?: unknown, parent?: ResolvingMetadata): Promise<Metadata> {
  const inherited = await parent;
  const config: SiteConfig = await getSiteConfig();
  const title = `Our Services - ${config.name}`;
  const description =
    "Explore original print-on-demand designs for t-shirts, hoodies and other merch, available on Redbubble, TeePublic and Tostadora, plus custom design requests.";

  return {
    title,
    description,
    alternates: { canonical: "/services" },
    openGraph: {
      ...inherited?.openGraph,
      url: `https://${config.domain}/services`,
      type: "website",
      title,
      description,
    },
    twitter: {
      ...inherited?.twitter,
      title,
      description,
    },
  };
}

const services = [
  {
    title: "Original Print-on-Demand Designs",
    description:
      "Original artwork created for t-shirts, hoodies and other everyday merch.",
    features: [
      "New designs added regularly",
      "Made for t-shirts, hoodies and more",
      "Printed on demand, no minimum order",
    ],
  },
  {
    title: "Themed Design Collections",
    description:
      "Designs grouped into collections by theme, so it's easy to find something that fits.",
    features: [
      "Browse by collection",
      "Consistent style across a collection",
      "Easy to find a matching gift",
    ],
  },
  {
    title: "Custom Design Requests",
    description:
      "Have an idea in mind? Tell us about it through our contact form.",
    features: [
      "Personal messages and themes",
      "Collaborative ideation",
      "AI-assisted concepts refined by designers",
    ],
  },
];

export default async function Services() {
  const config: SiteConfig = await getSiteConfig();
  return (
    <PageShell>
      <JsonLd data={pageJsonLd(config, "/services", "Our Services")} />
      <PageHeader
        title="Our Services"
        intro={`${config.name} creates original designs and turns them into print-on-demand apparel and merch, sold through our marketplace partners.`}
        introClassName="max-w-none"
      />

      <CardGrid columns={3}>
        {services.map((service, index) => (
          <div key={index} className="bg-card shadow-md rounded-lg p-6">
            <SectionHeading>{service.title}</SectionHeading>
            <p className="text-muted-foreground mb-4">{service.description}</p>
            <ul className="space-y-2">
              {service.features.map((feature, featureIndex) => (
                <li key={featureIndex} className="flex items-center">
                  <CheckCircle className="text-accent mr-2" size={20} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardGrid>

      <div className="mt-12">
        <SectionHeading>Where to Buy</SectionHeading>
        <p className="text-muted-foreground mb-4">
          Our designs are printed and shipped by our marketplace partners,
          including Redbubble, TeePublic and Tostadora. Shop links may be
          affiliate links for which we may earn a commission at no extra cost
          to you — see our{" "}
          <AccentLink href="/disclosure">affiliate disclosure</AccentLink>.
        </p>
        <div className="flex flex-wrap gap-4">
          <AccentLink href="/designs">Browse our designs</AccentLink>
          <Link href="/contact" className={buttonVariants()}>
            Request a custom design
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
