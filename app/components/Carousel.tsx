"use client";

import Slider from "react-slick";
import Image from "next/image";

const defaultSettings = {
  dots: true,
  infinite: true,
  speed: 500,
  slidesToShow: 1,
  slidesToScroll: 1,
  autoplay: true,
  autoplaySpeed: 5000,
};

type CarouselProps = {
  carouselItems: {
    image: string;
    title: string;
    description: string;
  }[];
  settings?: typeof defaultSettings;
};

export function Carousel({
  carouselItems,
  settings = defaultSettings,
}: CarouselProps) {
  return (
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
  );
}
