"use client";

import Image from "next/image";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { useEffect, useState, useContext } from "react";
import { supabase } from "@/utils/supabase";
import { Design } from "@/types/design";
import {
  designCardHeight,
  designCardWidth,
  getImageUrl,
  getPlaceholderImage,
} from "@/lib/image";
import { truncateText } from "@/lib/utils";
import { ConfigContext } from "@/app/wrapper";

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

export default function Home() {
  const config = useContext(ConfigContext);
  const [featuredDesigns, setFeaturedDesigns] = useState<Design[]>([]);

  useEffect(() => {
    async function fetchFeaturedDesigns() {
      const { data, error } = await supabase.from("designs").select("*");

      if (error) {
        console.error("Error fetching designs:", error);
        return;
      }

      // Randomly select 3 designs
      const randomDesigns = data.sort(() => 0.5 - Math.random()).slice(0, 3);
      setFeaturedDesigns(randomDesigns);
    }

    void fetchFeaturedDesigns();
  }, []);

  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 5000,
  };

  return (
    <>
      <Helmet>
        <title>{`${config.name} - ${config.intro}`}</title>
        <meta name="description" content={config.description} />
        <meta name="keywords" content={config.keywords} />
      </Helmet>

      <section className="w-full -mt-16">
        <Slider {...settings}>
          {carouselItems.map((item, index) => (
            <div key={index} className="relative h-[calc(100vh-64px)]">
              <Image
                src={item.image}
                alt={item.title}
                fill
                style={{ objectFit: "cover" }}
              />
              <div className="absolute inset-0 bg-[#212A31] bg-opacity-60 flex flex-col justify-center items-center text-center p-4">
                <h2 className="text-3xl md:text-5xl font-bold mb-4 text-[#D3D9D4]">
                  {item.title}
                </h2>
                <p className="text-xl md:text-2xl text-[#748D92]">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </Slider>
      </section>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <section className="text-center mb-12 bg-[#212A31] text-[#D3D9D4] py-16 rounded-lg">
          <h1 className="text-4xl font-bold mb-4">Welcome to {config.name}</h1>
          <p className="text-xl text-[#748D92]">
            Weaving innovation into every design
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">
            Featured Designs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredDesigns.map((design) => (
              <div
                key={design.id}
                className="bg-white shadow-md rounded-lg overflow-hidden"
              >
                <Image
                  src={
                    design.externalImageUrl ||
                    getPlaceholderImage(designCardWidth, designCardHeight)
                  }
                  alt={design.title}
                  width={designCardWidth}
                  height={designCardHeight}
                  loading="lazy"
                  style={{ objectFit: "cover" }}
                  className={`w-full h-[${designCardWidth}px] object-cover`}
                />
                <div className="p-4">
                  <h3 className="font-semibold mb-2 text-[#212A31]">
                    {design.title}
                  </h3>
                  <p className="text-[#748D92]">
                    {truncateText(design.description, 100)}
                  </p>
                  <Link
                    href={`/designs/${design.id}`}
                    className="text-[#124E66] hover:underline mt-2 inline-block"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
