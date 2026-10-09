import { Metadata } from "next";
import { getSiteConfig, fetchDesigns } from "@/utils/database";
import { Design } from "@/types/design";
import { SiteConfig, CarouselSlide } from "@/lib/store";
import { Carousel } from "@/app/components/Carousel";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import FeaturedDesigns from "@/app/components/FeaturedDesigns";

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

// Every slide must route somewhere: the hero is the funnel's first screen.
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
  const title = `${config.name} - ${config.intro}`;

  return {
    title,
    description: config.description,
    keywords: config.keywords,
    alternates: { canonical: "/" },
    openGraph: {
      url: `https://${config.domain}`,
      type: "website",
      title,
      description: config.description,
    },
    twitter: {
      title,
      description: config.description,
    },
  };
}

export default async function Home() {
  const { featuredDesigns, config } = await getFeaturedDesigns();

  return (
    <>
      <Carousel carouselItems={resolveCarouselItems(config.slides)} />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
        <section className="text-center mb-8 bg-primary text-primary-foreground py-8 rounded-lg">
          <h1 className="text-4xl font-bold mb-3">
            {config.name}: {config.intro}
          </h1>
          {config.subtitle && (
            <p className="text-xl text-primary-foreground/90">
              {config.subtitle}
            </p>
          )}
        </section>
        <FeaturedDesigns title="Featured Designs" designs={featuredDesigns} />
      </div>
    </>
  );
}
