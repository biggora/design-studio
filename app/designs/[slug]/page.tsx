import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { getSiteConfig, getDesignById, getDesignBySlug } from "@/utils/database";
import {
  getPlaceholderImage,
  designCardHeight,
  designCardWidth,
} from "@/lib/image";
import { notFound, permanentRedirect } from "next/navigation";
import {
  formatDate,
  getRedBubbleDesignPageLink,
  safeHexColor,
  sanitizeUrl,
  truncateText,
} from "@/lib/utils";
import { Metadata } from "next";
import { SiteConfig } from "@/lib/store";
import { UUID_PATTERN, SLUG_PATTERN, designPath } from "@/lib/slug";
import FeaturedDesigns from "@/app/components/FeaturedDesigns";
import ShopLinks from "@/app/components/ShopLinks";
import ShareLinks from "@/app/components/ShareLinks";
import { JsonLd } from "@/app/components/JsonLd";
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
  const title = `${design.title} - ${config.name} Design`;
  const description = `Discover the unique ${design.title} design by ${config.name}. ${truncateText(design.description, 180)}`;
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
      images: [design.externalImageUrl],
    },
    twitter: {
      title,
      description,
      images: [design.externalImageUrl],
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
    image: design.externalImageUrl,
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
        <Link
          href="/designs"
          className="text-accent hover:underline mb-4 inline-block"
        >
          &larr; Back to Designs
        </Link>
        <div className="bg-card shadow-md rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div
              className="relative md:pb-0 md:h-full"
              style={{ backgroundColor: safeHexColor(design.backgroundColor) }}
            >
              <Image
                src={design.externalImageUrl || getPlaceholderImage(900, 600)}
                alt={design.title}
                width={designCardWidth}
                height={designCardHeight}
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
              {/*<div className="grid grid-cols-2 gap-4 mb-6">*/}
              {/*  <div>*/}
              {/*    <h2 className="text-xl font-semibold mb-2 text-[#212A31]">*/}
              {/*      Dimensions*/}
              {/*    </h2>*/}
              {/*    <p className="text-[#748D92]">{design.dimensions}</p>*/}
              {/*  </div>*/}
              {/*  <div>*/}
              {/*    <h2 className="text-xl font-semibold mb-2 text-[#212A31]">*/}
              {/*      Material*/}
              {/*    </h2>*/}
              {/*    <p className="text-[#748D92]">{design.material}</p>*/}
              {/*  </div>*/}
              {/*  <div>*/}
              {/*    <h2 className="text-xl font-semibold mb-2 text-[#212A31]">*/}
              {/*      Price*/}
              {/*    </h2>*/}
              {/*    <p className="text-[#748D92]">${design.price}</p>*/}
              {/*  </div>*/}
              {/*  <div>*/}
              {/*    <h2 className="text-xl font-semibold mb-2 text-[#212A31]">*/}
              {/*      Availability*/}
              {/*    </h2>*/}
              {/*    <p className="text-[#748D92]">*/}
              {/*      {design.inStock ? "In Stock" : "Out of Stock"}*/}
              {/*    </p>*/}
              {/*  </div>*/}
              {/*</div>*/}
              <div className={`grid grid-cols-1 md:grid-cols-2`}>
                {design.collection && (
                  <p className="text-muted-foreground mb-4">
                    Collection:&nbsp;
                    <Link href={collectionUrl}>
                      {design.collection}
                    </Link>
                  </p>
                )}
                <p className="text-muted-foreground mb-4 lg:text-right">
                  Created on: {formatDate(design.createdAt)}
                </p>
              </div>
              <a
                href={sanitizeUrl(design.externalLink)}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ className: "w-full" })}
              >
                Shop products with this design
              </a>
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Printed &amp; shipped by our partner — opens in a new tab
              </p>
              <div className={`grid grid-cols-1 md:grid-cols-2`}>
                <div className="flex justify-start items-center space-x-4 mt-4">
                  <ShareLinks
                    shareText={shareText}
                    shareUrl={shareUrl}
                    imageUrl={design.externalImageUrl}
                  />
                </div>
                <div className="flex justify-end items-center space-x-4 mt-4">
                  <ShopLinks
                    title="Our Shops"
                    styleTitle={" "}
                    redBubble={getRedBubbleDesignPageLink(design.externalId)}
                  />
                </div>
              </div>
              {/**/}
            </div>
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FeaturedDesigns
          title="More from this collection"
          designs={relatedDesigns}
        />
      </div>
    </>
  );
}
