import { cache } from "react";
import { getSiteConfig, getDesignById, getDesignBySlug, fetchRandomDesigns, fetchPublicListings } from "@/utils/database";
import { getShareImageUrl, getProductMockupUrl, type ProductMockupKey } from "@/lib/image";
import { notFound, permanentRedirect } from "next/navigation";
import {
  formatDate,
  getRedBubbleDesignPageLink,
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
import { DesignImage } from "@/app/components/DesignImage";
import { JsonLd } from "@/app/components/JsonLd";
import { pageJsonLd, tshirtProductJsonLd } from "@/lib/structured-data";
import { getTshirtOffers, tshirtPriceSources, isVerifiedPrice } from "@/lib/marketplace-prices";
import { TshirtPrices } from "@/app/components/TshirtPrices";
import BuyLink from "@/app/components/BuyLink";
import { MobileBuyBar } from "@/app/components/MobileBuyBar";
import { AccentLink } from "@/app/components/AccentLink";
import { PageShell } from "@/app/components/PageShell";
import { buttonVariants } from "@/components/ui/button";
import { collectionPath, collectionDisplayNames } from "@/lib/collections";
import { getGiftPages, giftPath, orderGiftPages } from "@/lib/gifts";
import { matchesGiftPage } from "@/lib/gift-selection";

type Props = {
  params: Promise<{ slug: string }>;
};

/** The product mockups the detail page offers beside the artwork, in display order. */
const PRODUCT_MOCKUPS: { key: ProductMockupKey; label: string }[] = [
  { key: "mockup_hat", label: "Hat" },
  { key: "mockup_mug", label: "Mug" },
  { key: "mockup_mousepad", label: "Mouse pad" },
];

// Per-request dedupe: generateMetadata and the page share one DB lookup.
const loadDesign = cache(async (param: string) => {
  if (UUID_PATTERN.test(param)) return getDesignById(param); // legacy /designs/<uuid> links
  if (param.length > 255 || !SLUG_PATTERN.test(param)) return null; // skip the DB for junk
  return getDesignBySlug(param);
});

export const revalidate = 300;

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
      ...(design.ogImage ? { images: [{
        url: `https://${config.domain}${designPath(design)}/opengraph-image?v=${design.ogImage.assignment.hash}`,
        width: 1200, height: 630, type: "image/jpeg", alt: design.ogImage.assignment.title,
      }] } : {}),
      url: `https://${config.domain}${designPath(design)}`,
      type: "website",
      title,
      description,
    },
    twitter: {
      ...(design.ogImage ? { images: [`https://${config.domain}${designPath(design)}/opengraph-image?v=${design.ogImage.assignment.hash}`] } : {}),
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

  const { design } = data;

  if (UUID_PATTERN.test(slug) && design.slug) {
    permanentRedirect(designPath(design));
  }

  // Canonical display name for the raw collection value (chips/labels use the
  // curated heading); URLs keep the raw value. Collection-less designs keep
  // the plain "Designs" breadcrumb.
  const collectionNames = collectionDisplayNames(config.collectionPages);
  const collectionDisplayName = design.collection
    ? collectionNames.get(design.collection) ?? design.collection
    : "Designs";

  // Designs without collection memberships (or alone in theirs) would
  // otherwise dead-end into the footer; fall back to random catalog picks.
  let relatedDesigns = data.relatedDesigns;
  let relatedTitle = "More from this collection";
  if (relatedDesigns.length === 0) {
    relatedDesigns = (await fetchRandomDesigns(6))
      .filter((candidate) => candidate.id !== design.id)
      .slice(0, 5);
    relatedTitle = "More prints";
  }

  const collectionParams = new URLSearchParams();
  if (design.collection) collectionParams.set("collection", design.collection);
  const collectionQuery = collectionParams.toString();
  const collectionUrl = collectionQuery ? `/designs?${collectionQuery}` : "/designs";

  const giftLinks = orderGiftPages(getGiftPages(config.giftPages)).filter((page) =>
    matchesGiftPage(design, page),
  );

  // Only the products the marketplace actually lists for this design — the sync
  // captures a mockup per product, so missing ones leave no empty tiles.
  const productMockups = PRODUCT_MOCKUPS.flatMap((mockup) => {
    const url = getProductMockupUrl(design, mockup.key);
    return url ? [{ ...mockup, url }] : [];
  });

  const shareUrl = `https://${config.domain}${designPath(design)}`;
  const shareText = `Check out this amazing design: ${design.title} by ${config.name}`;

  const teePublicLink = applyTeepublicReferral(
    getTeepublicLink(design),
    config.affiliate.teepublicReferralId,
  );
  // Tostadora's and Zazzle's listing URLs live only in design_listings (no
  // externalLink/props bridge); absent or on lookup failure the button just
  // doesn't render.
  const listings = await fetchPublicListings([design.id])
    .then(byDesign => byDesign[design.id] || [])
    .catch(error => { console.warn("Marketplace listings unavailable:", error); return []; });
  const tostadoraUrl = listings.find(listing => listing.platform === "tostadora")?.url;
  const zazzleUrl = listings.find(listing => listing.platform === "zazzle")?.url;
  const tshirtOffers = await getTshirtOffers(design.id, tshirtPriceSources(design, listings));
  const buyUrl = sanitizeUrl(applyRedbubbleAffiliate(
    tshirtOffers.find(offer => offer.platform === "redbubble")?.url ||
      design.externalLink || (design.externalId !== null ? getRedBubbleDesignPageLink(design.externalId) : ""),
    config.affiliate.redbubbleTemplate,
  ));
  // Share surfaces (Pinterest intent, JSON-LD) take the share image — the CDN's
  // pre-flattened JPEG when published, else the Redbubble display image.
  const shareImage = getShareImageUrl(design) || "/images/no_image_available.svg";
  const verifiedOffer = tshirtOffers.find(isVerifiedPrice);
  const tshirtProduct = verifiedOffer
    ? tshirtProductJsonLd(shareUrl, verifiedOffer, design.description, new URL(shareImage, `https://${config.domain}/`).href)
    : null;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${shareUrl}#breadcrumb`,
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
        name: collectionDisplayName,
        item: `https://${config.domain}${design.collection ? collectionPath(design.collection) : "/designs"}`,
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
    "@id": `${shareUrl}#artwork`,
    additionalType: "https://schema.org/VisualArtwork",
    mainEntityOfPage: { "@id": `${shareUrl}#webpage` },
    name: design.title,
    description: design.description,
    image: new URL(shareImage, `https://${config.domain}/`).href,
    url: shareUrl,
    ...(design.createdAt ? { dateCreated: design.createdAt } : {}),
    keywords: design.keywords,
    creator: {
      "@type": "Organization",
      "@id": `https://${config.domain}/#organization`,
      name: config.name,
    },
  };

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, creativeWorkJsonLd, {
        ...pageJsonLd(config, designPath(design), design.title),
        description: design.description,
        mainEntity: tshirtProduct
          ? [{ "@id": `${shareUrl}#artwork` }, { "@id": tshirtProduct["@id"] }]
          : { "@id": `${shareUrl}#artwork` },
        breadcrumb: { "@id": `${shareUrl}#breadcrumb` },
      }]} />
      {tshirtProduct && <JsonLd data={tshirtProduct} />}
      <PageShell>
        <BackToCatalog fallbackHref={collectionUrl} />
        <div className="bg-card shadow-md rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative bg-card md:pb-0 md:h-full">
              <DesignImage
                design={design}
                alt={design.collection ? `${design.title} – ${design.collection} design` : `${design.title} design`}
                priority
                className="object-contain w-full h-full"
              />
            </div>
            <div className="p-6 flex flex-col justify-center">
              <h1 className="font-display text-3xl font-bold tracking-[-0.02em] mb-4 text-foreground">
                {design.title}
              </h1>
              <p className="text-muted-foreground mb-6">
                {design.description}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2">
                {design.collection && (
                  <p className="text-muted-foreground mb-4">
                    Collection:&nbsp;
                    <AccentLink href={collectionUrl}>
                      {collectionDisplayName}
                    </AccentLink>
                  </p>
                )}
                {giftLinks.length > 0 && (
                  <p className="text-muted-foreground mb-4">
                    Gift ideas:&nbsp;
                    {giftLinks.map((page, index) => (
                      <span key={page.slug}>
                        {index > 0 && ", "}
                        <AccentLink href={giftPath(page.slug)}>
                          {page.heading || page.title}
                        </AccentLink>
                      </span>
                    ))}
                  </p>
                )}
              </div>
              <TshirtPrices offers={tshirtOffers} design={design} config={config} />
              {buyUrl !== "#" && (
                <div data-in-card-buy>
                  <BuyLink
                    href={buyUrl}
                    platform="redbubble"
                    designSlug={design.slug || design.id}
                    pageType="design"
                    position="primary"
                    className={buttonVariants({ className: "w-full gap-2 min-h-11" })}
                  >
                    Buy on Redbubble
                    <span aria-hidden="true">&#8599;</span>
                  </BuyLink>
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Printed &amp; shipped by our marketplace partner. We may earn a
                commission —{" "}
                <AccentLink href="/disclosure">learn more</AccentLink>
              </p>
              {teePublicLink && !tshirtOffers.some(offer => offer.platform === "teepublic") && (
                <BuyLink
                  href={sanitizeUrl(teePublicLink)}
                  platform="teepublic"
                  designSlug={design.slug || design.id}
                  pageType="design"
                  position="secondary"
                  className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3 w-full gap-2" })}
                >
                  Buy on TeePublic
                  <span aria-hidden="true">&#8599;</span>
                </BuyLink>
              )}
              {tostadoraUrl && !tshirtOffers.some(offer => offer.platform === "tostadora") && (
                <BuyLink
                  href={sanitizeUrl(tostadoraUrl)}
                  platform="tostadora"
                  designSlug={design.slug || design.id}
                  pageType="design"
                  position="secondary"
                  className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3 w-full gap-2" })}
                >
                  Buy on Tostadora
                  <span aria-hidden="true">&#8599;</span>
                </BuyLink>
              )}
              {zazzleUrl && !tshirtOffers.some(offer => offer.platform === "zazzle") && (
                <BuyLink
                  href={sanitizeUrl(zazzleUrl)}
                  platform="zazzle"
                  designSlug={design.slug || design.id}
                  pageType="design"
                  position="secondary"
                  className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3 w-full gap-2" })}
                >
                  Buy on Zazzle
                  <span aria-hidden="true">&#8599;</span>
                </BuyLink>
              )}
              {productMockups.length > 0 && (
                <div className="mt-4 mb-6">
                  <div className="grid grid-cols-3 gap-3">
                    {productMockups.map((mockup) => (
                      <figure key={mockup.key} className="min-w-0">
                        <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                          <DesignImage
                            design={design}
                            src={mockup.url}
                            alt={`${design.title} on a ${mockup.label}`}
                            fill
                            sizes="(min-width: 768px) 200px, 30vw"
                            className="object-contain"
                          />
                        </div>
                        <figcaption className="mt-1.5 text-center text-xs text-muted-foreground">
                          {mockup.label}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center space-x-4 mt-6">
                <ShareLinks
                  shareText={shareText}
                  shareUrl={shareUrl}
                  imageUrl={shareImage}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Created on: {formatDate(design.createdAt)}
              </p>
            </div>
          </div>
        </div>
      </PageShell>
      {buyUrl !== "#" && <MobileBuyBar href={buyUrl} designSlug={design.slug || design.id} />}
      <PageShell>
        <FeaturedDesigns
          title={relatedTitle}
          designs={relatedDesigns}
          showCollection={false}
          collectionLabels={collectionNames}
        />
      </PageShell>
    </>
  );
}
