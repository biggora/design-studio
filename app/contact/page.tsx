import { Metadata, type ResolvingMetadata } from "next";
import { SiteConfig } from "@/lib/store";
import ContactForm from "../components/ContactForm";
import SocialLinks from "../components/SocialLinks";
import ShopLinks from "@/app/components/ShopLinks";
import { getSiteConfig } from "@/utils/database";
import {
  applyRedbubbleAffiliate,
  applyTeepublicReferral,
} from "@/lib/affiliate";
import { AccentLink } from "@/app/components/AccentLink";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { SectionHeading } from "@/app/components/SectionHeading";

export async function generateMetadata(_props?: unknown, parent?: ResolvingMetadata): Promise<Metadata> {
  const inherited = await parent;
  const config: SiteConfig = await getSiteConfig();
  const title = `Contact Us - ${config.name}`;
  const description = `Get in touch with ${config.name}. We're here to answer your questions and discuss your custom design requests.`;
  return {
    title,
    description,
    keywords: "contact, get in touch, custom design requests, print-on-demand",
    alternates: { canonical: "/contact" },
    openGraph: {
      ...inherited?.openGraph,
      url: `https://${config.domain}/contact`,
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

export default async function Contact() {
  const config: SiteConfig = await getSiteConfig();
  // Affiliate wrapping happens server-side at render time; the stored/config
  // shop URLs stay canonical. Empty config values stay empty (no-op).
  const redBubbleUrl = config.representation.redbuble
    ? applyRedbubbleAffiliate(
        config.representation.redbuble,
        config.affiliate.redbubbleTemplate,
      )
    : undefined;
  const teePublicUrl =
    applyTeepublicReferral(
      config.representation.teepublic || null,
      config.affiliate.teepublicReferralId,
    ) ?? undefined;
  const tostaDoraUrl =
    config.representation?.tostaDora || config.representation?.tostadora || undefined;

  return (
    <PageShell>
      <PageHeader title="Contact Us" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <SectionHeading>Get in Touch</SectionHeading>
          <ContactForm />
        </div>
        <div>
          <SocialLinks />
          <ShopLinks
            title="Our Shops"
            redBubble={redBubbleUrl}
            teePublic={teePublicUrl}
            tostaDora={tostaDoraUrl}
          />
          {(redBubbleUrl || teePublicUrl || tostaDoraUrl) && (
            <p className="text-sm text-muted-foreground mt-3">
              Shop links may be affiliate links — we may earn a commission at no
              extra cost to you.{" "}
              <AccentLink href="/disclosure">Affiliate disclosure</AccentLink>
            </p>
          )}
        </div>
      </div>
    </PageShell>
  );
}
