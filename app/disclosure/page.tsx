import { Metadata } from "next";
import Link from "next/link";
import { SiteConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/database";

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
    <div className="container mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-8 text-foreground">
        Affiliate Disclosure
      </h1>
      <div className="prose prose-lg max-w-none text-foreground">
        <p className="mb-4">Effective Date: {config.policyUpdateDate}</p>

        <p className="mb-4">
          {config.name} showcases artwork and links to third-party
          print-on-demand marketplaces that print and ship the products. Some of
          those links — including the &quot;Buy on Redbubble&quot; and &quot;Buy
          on TeePublic&quot; buttons — are affiliate or referral links. This page
          explains what that means.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">
          How we earn commissions
        </h2>
        <p className="mb-4">
          {config.name} participates in the Redbubble affiliate program
          (operated on the Impact platform) and in TeePublic&apos;s referral
          program. If you click one of our marketplace links and make a
          purchase, we may earn a commission from that marketplace. You pay the
          same price either way — a commission never adds to your cost.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4">
          What we do not do
        </h2>
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

        <h2 className="text-2xl font-semibold mt-8 mb-4">Questions</h2>
        <p className="mb-4">
          If you have questions about this disclosure, reach us through the{" "}
          <Link
            href="/contact"
            className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            contact page
          </Link>
          . See also our{" "}
          <Link
            href="/privacy-policy"
            className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            privacy policy
          </Link>{" "}
          for how cookies and analytics are handled on this site.
        </p>
      </div>
    </div>
  );
}
