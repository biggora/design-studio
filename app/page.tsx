import { Metadata } from "next";
import { getSiteConfig, fetchDesigns } from "@/utils/database";
import { Design } from "@/types/design";
import { getImageUrl } from "@/lib/image";
import { SiteConfig } from "@/lib/store";
import { Carousel } from "@/app/components/Carousel";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import FeaturedDesigns from "@/app/components/FeaturedDesigns";

const carouselItems = [
  {
    image: getImageUrl("slide_1.png"),
    title: "Original Designs for Everyday Wear",
    description: "Original artwork for t-shirts, hoodies and more",
  },
  {
    image: getImageUrl("slide_2.png"),
    title: "Bespoke Creations",
    description: "Tailored solutions for your unique vision",
  },
  {
    image: getImageUrl("slide_3.png"),
    title: "Artistic Excellence",
    description: "Where creativity meets craftsmanship",
  },
];

type FeaturedDesignsProps = {
  featuredDesigns: Design[];
  config: SiteConfig;
};

async function getFeaturedDesigns(): Promise<FeaturedDesignsProps> {
  const { designs } = await fetchDesigns(1, "", "", 3);
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
  const images = [config.siteLogo, config.siteBanner].filter(Boolean);

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
      images,
    },
    twitter: {
      title,
      description: config.description,
      images,
    },
  };
}

export default async function Home() {
  const { featuredDesigns, config } = await getFeaturedDesigns();

  return (
    <>
      <Carousel carouselItems={carouselItems} />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <section className="text-center mb-12 bg-primary text-primary-foreground py-16 rounded-lg">
          <h1 className="text-4xl font-bold mb-4">
            {config.name}: {config.intro}
          </h1>
          <p className="text-xl text-muted-foreground">
            Weaving innovation into every design
          </p>
        </section>
        <FeaturedDesigns title="Featured Designs" designs={featuredDesigns} />
      </div>
    </>
  );
}
