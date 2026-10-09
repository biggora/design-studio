import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSiteConfig, getDesignBySlug, getDesignById } from "@/utils/database";
import { getDesignDisplayImage, imageBlurPlaceholder } from "@/lib/image";
import {
  getRedBubbleDesignPageLink,
  getTeepublicLink,
  hasMarketplaceLink,
  safeHexColor,
  sanitizeUrl,
  truncateText,
} from "@/lib/utils";
import { applyRedbubbleAffiliate, applyTeepublicReferral } from "@/lib/affiliate";
import { UUID_PATTERN, SLUG_PATTERN, designPath } from "@/lib/slug";
import { pinImageUrl } from "@/lib/pinterest-feed";
import { SiteConfig } from "@/lib/store";
import { buttonVariants } from "@/components/ui/button";

/**
 * Minimal mobile-first landing page for Pinterest pins: the design, one click
 * to each marketplace (the same affiliate-wrapped links as the design page),
 * the affiliate disclosure, and a path on to the catalog. Pinterest requires
 * every feed link to live on the claimed domain and treats deceptive
 * redirects as spam, so this page never auto-redirects — the canonical URL
 * always points at the real /designs/<slug> page.
 *
 * Reachable only through the RSS feeds (noindex); it intentionally shows no
 * description, collection or related designs — that is what the design page
 * linked at the bottom is for.
 */

type Props = {
  params: Promise<{ slug: string }>;
};

// Per-request dedupe: generateMetadata and the page share one DB lookup.
const loadDesign = cache(async (param: string) => {
  if (UUID_PATTERN.test(param)) return getDesignById(param); // legacy /p/<uuid> links
  if (param.length > 255 || !SLUG_PATTERN.test(param)) return null; // skip the DB for junk
  return getDesignBySlug(param);
});

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const data = await loadDesign(params.slug);
  const config: SiteConfig = await getSiteConfig();

  if (!data || !data.design) {
    return {
      title: "Design Not Found",
      robots: { index: false },
    };
  }

  const { design } = data;
  const canonical = `https://${config.domain}${designPath(design)}`;
  const title = `${design.title} - ${config.name} Design`;
  const description = `${design.title} by ${config.name}. ${truncateText(design.description, 160)}`;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical },
    openGraph: {
      url: canonical,
      type: "website",
      title,
      description,
      images: [pinImageUrl(config.domain, design)],
    },
  };
}

export default async function PinLandingPage(props: Props) {
  const params = await props.params;
  const config: SiteConfig = await getSiteConfig();
  const data = await loadDesign(params.slug);

  if (!data || !data.design) {
    notFound();
  }

  const { design } = data;
  const buyUrl = sanitizeUrl(
    applyRedbubbleAffiliate(
      design.externalLink || (design.externalId !== null ? getRedBubbleDesignPageLink(design.externalId) : ""),
      config.affiliate.redbubbleTemplate,
    ),
  );
  const teePublicLink = sanitizeUrl(
    applyTeepublicReferral(getTeepublicLink(design), config.affiliate.teepublicReferralId),
  );
  const hasRedbubble = buyUrl !== "#";
  // Same "has a place to buy it" rule as the feed's item filter — a design on
  // no marketplace at all has no landing page to show.
  if (!hasMarketplaceLink(design) || (!hasRedbubble && teePublicLink === "#")) {
    notFound();
  }

  const primary = hasRedbubble
    ? { label: "Buy on Redbubble", href: buyUrl }
    : { label: "Buy on TeePublic", href: teePublicLink };
  const secondary = hasRedbubble
    ? (teePublicLink !== "#" ? { label: "Buy on TeePublic", href: teePublicLink } : null)
    : null;

  const displayImage = getDesignDisplayImage(design).trim() || "/images/no_image_available.svg";

  return (
    <main className="container mx-auto px-4 pb-8 pt-6">
      <div className="mx-auto w-full max-w-md">
        <div
          className="relative mx-auto h-[430px] w-full max-w-[322px] overflow-hidden rounded-lg shadow-md"
          style={{ backgroundColor: safeHexColor(design.backgroundColor) }}
        >
          <Image
            src={displayImage}
            alt={design.title}
            fill
            priority
            placeholder="blur"
            blurDataURL={imageBlurPlaceholder}
            sizes="322px"
            className="object-contain"
          />
        </div>
        <h1 className="mt-4 line-clamp-2 text-center text-xl font-semibold leading-tight text-foreground">
          {design.title}
        </h1>
        <a
          href={primary.href}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className={buttonVariants({ className: "mt-4 w-full gap-2" })}
        >
          {primary.label}
          <span aria-hidden="true">&#8599;</span>
        </a>
        {secondary && (
          <a
            href={secondary.href}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-input px-4 py-2 text-base text-accent transition-colors hover:border-accent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {secondary.label}
            <span aria-hidden="true">&#8599;</span>
          </a>
        )}
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Printed &amp; shipped by our marketplace partner. We may earn a commission —{" "}
          <Link
            href="/disclosure"
            className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            learn more
          </Link>
        </p>
        <p className="mt-6 text-center">
          <Link
            href={designPath(design)}
            className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            More about this design <span aria-hidden="true">&rarr;</span>
          </Link>
        </p>
      </div>
    </main>
  );
}
