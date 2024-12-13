import { Metadata } from "next";
import { getSiteConfig, supabase } from "@/utils/supabase";
import { Design } from "@/types/design";
import { getImageUrl } from "@/lib/image";
import { SiteConfig } from "@/lib/store";
import { Carousel } from "@/app/components/Carousel";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { DesignCard } from "@/app/components/DesignCard";

const carouselItems = [
  {
    image: getImageUrl("slide_1.png"),
    title: "Innovative Thread Designs",
    description: "Pushing the boundaries of textile art and design",
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
  const { data, error } = await supabase.from("designs").select("*");
  const config: SiteConfig = await getSiteConfig();
  if (error) {
    console.error("Error fetching designs:", error);
    return {
      featuredDesigns: [],
      config,
    };
  }

  // Randomly select 3 designs
  return {
    featuredDesigns: data.sort(() => 0.5 - Math.random()).slice(0, 3),
    config,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();

  return {
    title: `${config.name} - ${config.intro}`,
    description: config.description,
    keywords: config.keywords,
    openGraph: {
      title: `${config.name} - ${config.intro}`,
      description: config.description,
      images: [config.siteLogo, config.siteBanner],
    },
  };
}

export default async function Home() {
  const { featuredDesigns, config } = await getFeaturedDesigns();

  return (
    <>
      <Carousel carouselItems={carouselItems} />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <section className="text-center mb-12 bg-[#212A31] text-[#D3D9D4] py-16 rounded-lg">
          <h1 className="text-4xl font-bold mb-4">Welcome to {config.name}</h1>
          <p className="text-xl text-[#748D92]">
            Weaving innovation into every design
          </p>
        </section>
        {featuredDesigns && featuredDesigns.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">
              Featured Designs
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredDesigns.map((design) => (
                <DesignCard key={design.id} design={design} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
