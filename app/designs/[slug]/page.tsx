import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { getSiteConfig, getDesignById, getDesignBySlug } from "@/utils/database";
import {
  getDesignDisplayImage,
  designCardHeight,
  designCardWidth,
  imageBlurPlaceholder,
} from "@/lib/image";
import { notFound, permanentRedirect } from "next/navigation";
import {
  formatDate,
  getRedBubbleDesignPageLink,
  safeHexColor,
  getTeepublicLink,
  sanitizeUrl,
  truncateAtWord,
} from "@/lib/utils";
import { Metadata } from "next";
import { SiteConfig } from "@/lib/store";
import { UUID_PATTERN, SLUG_PATTERN, designPath } from "@/lib/slug";
import {
  applyRedbubbleAffiliate,
  applyTeepublicReferral,
} from "@/lib/affiliate";
import FeaturedDesigns from "@/app/components/FeaturedDesigns";
import BackToCatalog from "@/app/components/BackToCatalog";
import ShareLinks from "@/app/components/ShareLinks";
import { JsonLd } from "@/app/components/JsonLd";
import BuyLink from "@/app/components/BuyLink";
import { buttonVariants } from "@/components/ui/button";

type Props = {
  params: Promise<{ slug: string }>;
};

// Per-request dedupe: generateMetadata and the page share one DB lookup.
const loadDesign = cache(async (param: string) => {
  if (UUID_PATTERN.test(param)) return getDesignById(param); // legacy /designs/<uuid> links
  if (param.length > 255 || !SLUG_PATTERN.test(param)) return null; // skip the DB for junk
  return getDesignBySlug(param);
});

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const slug = params.slug;
  const data = await loadDesign(slug);
  const config: SiteConfig = await getSiteConfig();

  if (!data || !data.design) {
    return {
      title: "Design Not Found",
      robots: { index: false },
    };
  }

  const { design } = data;
  const title = `${design.title} - ${config.name}`;
  // og:image / twitter:image come from the opengraph-image file convention next to this page.
  const description = truncateAtWord(`${design.title} by ${config.name}. ${design.description}`, 155);
  return {
    title,
    description,
    keywords: `${design.keywords}, art, t-shirt design, ${config.name} design`,
    alternates: { canonical: designPath(design) },
    openGraph: {
      url: `https://${config.domain}${designPath(design)}`,
      type: "website",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function DesignDetails(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
  const slug = params.slug;
  const config: SiteConfig = await getSiteConfig();
  const data = await loadDesign(slug);

  if (!data || !data.design) {
    notFound();
  }

  const { design, relatedDesigns } = data;

  if (UUID_PATTERN.test(slug) && design.slug) {
    permanentRedirect(designPath(design));
  }

  const collectionParams = new URLSearchParams();
  if (design.collection) collectionParams.set("collection", design.collection);
  const collectionQuery = collectionParams.toString();
  const collectionUrl = collectionQuery ? `/designs?${collectionQuery}` : "/designs";

  const shareUrl = `https://${config.domain}${designPath(design)}`;
  const shareText = `Check out this amazing design: ${design.title} by ${config.name}`;

  const buyUrl = sanitizeUrl(
    applyRedbubbleAffiliate(
      design.externalLink || (design.externalId !== null ? getRedBubbleDesignPageLink(design.externalId) : ""),
      config.affiliate.redbubbleTemplate,
    ),
  );
  const teePublicLink = applyTeepublicReferral(
    getTeepublicLink(design),
    config.affiliate.teepublicReferralId,
  );
  const displayImage = getDesignDisplayImage(design).trim() || "/images/no_image_available.svg";

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `https://${config.domain}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Designs",
        item: `https://${config.domain}/designs`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: design.title,
        item: shareUrl,
      },
    ],
  };

  const creativeWorkJsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: design.title,
    description: design.description,
    image: displayImage,
    url: shareUrl,
    ...(design.createdAt ? { dateCreated: design.createdAt } : {}),
    keywords: design.keywords,
    creator: {
      "@type": "Organization",
      name: config.name,
    },
  };

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, creativeWorkJsonLd]} />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <BackToCatalog fallbackHref={collectionUrl} />
        <div className="bg-card shadow-md rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div
              className="relative md:pb-0 md:h-full"
              style={{ backgroundColor: safeHexColor(design.backgroundColor) }}
            >
              <Image
                src={displayImage || "/images/no_image_available.svg"}
                alt={design.title}
                width={designCardWidth}
                height={designCardHeight}
                priority
                placeholder="blur"
                blurDataURL={imageBlurPlaceholder}
                className="object-contain w-full h-full"
              />
            </div>
            <div className="p-6">
              <h1 className="text-3xl font-bold mb-4 text-foreground">
                {design.title}
              </h1>
              <p className="text-muted-foreground min-h-[200px] mb-6">
                {design.description}
              </p>
              <div className={`grid grid-cols-1 md:grid-cols-2`}>
                {design.collection && (
                  <p className="text-muted-foreground mb-4">
                    Collection:&nbsp;
                    <Link
                      href={collectionUrl}
                      className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {design.collection}
                    </Link>
                  </p>
                )}
                <p className="text-muted-foreground mb-4 lg:text-right">
                  Created on: {formatDate(design.createdAt)}
                </p>
              </div>
              {buyUrl !== "#" && (
                <BuyLink
                  href={buyUrl}
                  platform="redbubble"
                  designSlug={design.slug || design.id}
                  pageType="design"
                  position="primary"
                  className={buttonVariants({ className: "w-full gap-2" })}
                >
                  Buy on Redbubble
                  <span aria-hidden="true">&#8599;</span>
                </BuyLink>
              )}
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Printed &amp; shipped by our marketplace partner. We may earn a
                commission —{" "}
                <Link
                  href="/disclosure"
                  className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  learn more
                </Link>
              </p>
              {teePublicLink && (
                <BuyLink
                  href={sanitizeUrl(teePublicLink)}
                  platform="teepublic"
                  designSlug={design.slug || design.id}
                  pageType="design"
                  position="secondary"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-input px-4 py-2 text-base text-accent transition-colors hover:border-accent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Buy on TeePublic
                  <span aria-hidden="true">&#8599;</span>
                </BuyLink>
              )}
              <div className="flex items-center space-x-4 mt-6">
                <ShareLinks
                  shareText={shareText}
                  shareUrl={shareUrl}
                  imageUrl={displayImage}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FeaturedDesigns
          title="More from this collection"
          designs={relatedDesigns}
          showCollection={false}
        />
      </div>
    </>
  );
}
