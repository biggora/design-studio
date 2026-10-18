import { Metadata } from "next";
import { SiteConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/database";
import { AccentLink } from "@/app/components/AccentLink";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { SectionHeading } from "@/app/components/SectionHeading";

export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();
  const title = `Affiliate Disclosure - ${config.name}`;
  const description = `${config.name} may earn a commission when you buy through our marketplace partner links. Here is how it works.`;
  return {
    title,
    description,
    keywords: "affiliate disclosure, affiliate links, commissions",
    alternates: { canonical: "/disclosure" },
    openGraph: {
      url: `https://${config.domain}/disclosure`,
      type: "website",
      title,
      description,
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function AffiliateDisclosure() {
  const config: SiteConfig = await getSiteConfig();
  return (
    <PageShell>
      <PageHeader title="Affiliate Disclosure" />
      <div className="prose prose-lg max-w-none text-foreground">
        <p className="mb-4">Effective Date: {config.policyUpdateDate}</p>

        <p className="mb-4">
          {config.name} showcases artwork and links to third-party
          print-on-demand marketplaces that print and ship the products. Some of
          those links — including the &quot;Buy on Redbubble&quot; and &quot;Buy
          on TeePublic&quot; buttons — are affiliate or referral links. This page
          explains what that means.
        </p>

        <SectionHeading className="mt-8">How we earn commissions</SectionHeading>
        <p className="mb-4">
          {config.name} participates in the Redbubble affiliate program
          (operated on the Impact platform) and in TeePublic&apos;s referral
          program. If you click one of our marketplace links and make a
          purchase, we may earn a commission from that marketplace. You pay the
          same price either way — a commission never adds to your cost.
        </p>

        <SectionHeading className="mt-8">What we do not do</SectionHeading>
        <ul className="list-disc pl-6 mb-4">
          <li>We do not sell, produce, or ship any products ourselves.</li>
          <li>
            Checkout, payments, shipping, returns, and customer support are
            handled entirely by the marketplace you buy from (Redbubble,
            TeePublic, or Tostadora).
          </li>
          <li>
            We only link to products of our own designs; we do not accept
            payment for placement or endorsement of third-party products.
          </li>
        </ul>

        <SectionHeading className="mt-8">Questions</SectionHeading>
        <p className="mb-4">
          If you have questions about this disclosure, reach us through the{" "}
          <AccentLink href="/contact">contact page</AccentLink>. See also our{" "}
          <AccentLink href="/privacy-policy">privacy policy</AccentLink> for how
          cookies and analytics are handled on this site.
        </p>
      </div>
    </PageShell>
  );
}
