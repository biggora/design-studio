import { Metadata } from "next";
import { getSiteConfig, fetchDesigns, fetchFeaturedCollections, fetchLiveGiftPages } from "@/utils/database";
import { Design } from "@/types/design";
import { SiteConfig, CarouselSlide } from "@/lib/store";
import { Carousel } from "@/app/components/Carousel";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import FeaturedDesigns from "@/app/components/FeaturedDesigns";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import { AccentLink } from "@/app/components/AccentLink";
import { LinkChip } from "@/app/components/LinkChip";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { SectionHeading } from "@/app/components/SectionHeading";
import {collectionPath} from "@/lib/collections";
import {giftPath, orderGiftPages} from "@/lib/gifts";
import defaultConfig from "@/config/config.json";

// Bundled fallback: shown when config.slides is absent, empty, or malformed.
const defaultCarouselItems: CarouselSlide[] = [
  {
    image: "/images/slide_1.png",
    title: "Original Designs for Everyday Wear",
    description: "Original artwork for t-shirts, hoodies and more",
    ctaLabel: "Browse designs",
    ctaHref: "/designs",
  },
  {
    image: "/images/slide_2.png",
    title: "Bespoke Creations",
    description: "Tailored solutions for your unique vision",
    ctaLabel: "Browse designs",
    ctaHref: "/designs",
  },
  {
    image: "/images/slide_3.png",
    title: "Artistic Excellence",
    description: "Where creativity meets craftsmanship",
    ctaLabel: "Browse designs",
    ctaHref: "/designs",
  },
];

// Every slide retains a route to the catalog.
const DEFAULT_CTA_LABEL = "Browse designs";
const DEFAULT_CTA_HREF = "/designs";

function resolveCarouselItems(slides: SiteConfig["slides"]): CarouselSlide[] {
  const configured = (Array.isArray(slides) ? slides : []).filter(
    (slide) =>
      !!slide &&
      typeof slide.image === "string" &&
      slide.image.trim() !== "" &&
      typeof slide.title === "string" &&
      slide.title.trim() !== "",
  ).map((slide) => ({
    ...slide,
    ctaLabel:
      typeof slide.ctaLabel === "string" && slide.ctaLabel.trim() !== ""
        ? slide.ctaLabel
        : DEFAULT_CTA_LABEL,
    ctaHref:
      typeof slide.ctaHref === "string" && slide.ctaHref.trim() !== ""
        ? slide.ctaHref
        : DEFAULT_CTA_HREF,
  }));
  return configured.length > 0 ? configured : defaultCarouselItems;
}

type FeaturedDesignsProps = {
  featuredDesigns: Design[];
  config: SiteConfig;
};

async function getFeaturedDesigns(): Promise<FeaturedDesignsProps> {
  const { designs } = await fetchDesigns(1, "", "", 5);
  const config: SiteConfig = await getSiteConfig();

  const featuredDesigns: Design[] = designs || [];

  return {
    featuredDesigns,
    config,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();
  const home = {...defaultConfig.home, ...config.home};
  const title = `${home.title} - ${config.name}`;

  return {
    title,
    description: home.description,
    alternates: { canonical: "/" },
    openGraph: {
      url: `https://${config.domain}`,
      type: "website",
      title,
      description: home.description,
    },
    twitter: {
      title,
      description: home.description,
    },
  };
}

export default async function Home() {
  const { featuredDesigns, config } = await getFeaturedDesigns();
  const collections = await fetchFeaturedCollections(config.collectionPages);
  const home = {...defaultConfig.home, ...config.home};
  const giftPages = orderGiftPages(await fetchLiveGiftPages(config.giftPages));

  return (
    <>
      <Carousel carouselItems={resolveCarouselItems(config.slides)} />
      <PageShell className="pt-6 sm:pt-8 pb-12">
        <section aria-labelledby="home-heading" className="mb-6 sm:mb-8">
          <PageHeader
            id="home-heading"
            title={home.heading}
            intro={home.description}
            className="text-3xl sm:text-4xl mb-3"
            introClassName="max-w-2xl mb-4"
          />
          <form action="/designs" method="get" role="search" aria-label="Search print catalog" className="max-w-2xl">
            <label htmlFor="home-search" className="block font-medium mb-2 text-foreground">Search prints</label>
            <div className="flex gap-2">
              <Input id="home-search" name="search" type="search" placeholder="Try cat lover gift" className="min-w-0 h-11" />
              <Button type="submit" className="min-h-11">Search</Button>
            </div>
          </form>
          <AccentLink href="/designs" className="inline-flex items-center min-h-11 mt-2">Browse all prints</AccentLink>
        </section>
        {collections.length > 0 && (
          <nav aria-label="Browse by interest" className="mb-8">
            <SectionHeading className="text-xl mb-3">Browse by interest</SectionHeading>
            <ul className="flex flex-wrap gap-2">
              {collections.map(collection => (
                <li key={collection.collection}>
                  <LinkChip href={collectionPath(collection.collection)}>
                    {collection.heading || collection.title}
                  </LinkChip>
                </li>
              ))}
              <li>
                <AccentLink href="/collections" className="inline-flex items-center min-h-11 px-2 text-sm">
                  See all collections
                </AccentLink>
              </li>
            </ul>
          </nav>
        )}
        {giftPages.length > 0 && (
          <nav aria-label="Gift ideas" className="mb-8">
            <SectionHeading className="text-xl mb-3">Gift ideas</SectionHeading>
            <ul className="flex flex-wrap gap-2">
              {giftPages.map(page => (
                <li key={page.slug}>
                  <LinkChip href={giftPath(page.slug)}>
                    {page.heading || page.title}
                  </LinkChip>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <FeaturedDesigns title="Latest Prints" designs={featuredDesigns} compactOnMobile />
      </PageShell>
    </>
  );
}
