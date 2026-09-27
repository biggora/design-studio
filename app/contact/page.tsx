import { Metadata } from "next";
import Link from "next/link";
import { SiteConfig } from "@/lib/store";
import ContactForm from "../components/ContactForm";
import SocialLinks from "../components/SocialLinks";
import ShopLinks from "@/app/components/ShopLinks";
import { getSiteConfig } from "@/utils/database";
import {
  applyRedbubbleAffiliate,
  applyTeepublicReferral,
} from "@/lib/affiliate";

export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();
  const title = `Contact Us - ${config.name}`;
  const description = `Get in touch with ${config.name}. We're here to answer your questions and discuss your custom design requests.`;
  return {
    title,
    description,
    keywords: "contact, get in touch, custom design requests, print-on-demand",
    alternates: { canonical: "/contact" },
    openGraph: {
      url: `https://${config.domain}/contact`,
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
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-4xl font-bold mb-8 text-foreground">Contact Us</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <h2 className="text-2xl font-semibold mb-4 text-foreground">
            Get in Touch
          </h2>
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
              <Link
                href="/disclosure"
                className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Affiliate disclosure
              </Link>
            </p>
          )}
          {/*<div className="mt-6">*/}
          {/*  <p className="text-[#212A31]">Email: {config.email}</p>*/}
          {/*  {config.phone && <p className="text-[#212A31]">Phone: {config.phone}</p>}*/}
          {/*  <p className="text-[#212A31]">Address: {config.address}</p>*/}
          {/*</div>*/}
        </div>
      </div>
    </div>
  );
}
