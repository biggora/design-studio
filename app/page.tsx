"use client";

import Image from "next/image";
import Link from "next/link";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

const carouselItems = [
  {
    image: "/placeholder.svg",
    title: "Innovative Designs",
    description: "Pushing the boundaries of thread-based art",
  },
  {
    image: "/placeholder.svg",
    title: "Custom Creations",
    description: "Tailored solutions for your unique vision",
  },
  {
    image: "/placeholder.svg",
    title: "Artistic Excellence",
    description: "Where creativity meets craftsmanship",
  },
];

export default function Home() {
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
    <div className="container mx-auto px-6 py-12">
      <section className="mb-12">
        <Slider {...settings}>
          {carouselItems.map((item, index) => (
            <div key={index} className="relative h-[400px] md:h-[600px]">
              <Image
                src={item.image}
                alt={item.title}
                fill
                style={{ objectFit: "cover" }}
                className="rounded-lg"
              />
              <div className="absolute inset-0 bg-[#212A31] bg-opacity-60 flex flex-col justify-center items-center text-center p-4 rounded-lg">
                <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[#D3D9D4]">
                  {item.title}
                </h2>
                <p className="text-xl text-[#748D92]">{item.description}</p>
              </div>
            </div>
          ))}
        </Slider>
      </section>

      <section className="text-center mb-12 bg-[#212A31] text-[#D3D9D4] py-16 rounded-lg">
        <h1 className="text-4xl font-bold mb-4">Welcome to ThreadQuirk</h1>
        <p className="text-xl text-[#748D92]">
          Weaving innovation into every design
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">
          Featured Projects
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Featured project cards */}
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <Image
              src="/placeholder.svg"
              alt="Project 1"
              width={400}
              height={300}
              className="w-full"
            />
            <div className="p-4">
              <h3 className="font-semibold mb-2 text-[#212A31]">
                Project Title
              </h3>
              <p className="text-[#748D92]">Short project description</p>
            </div>
          </div>
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <Image
              src="/placeholder.svg"
              alt="Project 2"
              width={400}
              height={300}
              className="w-full"
            />
            <div className="p-4">
              <h3 className="font-semibold mb-2 text-[#212A31]">
                Project Title
              </h3>
              <p className="text-[#748D92]">Short project description</p>
            </div>
          </div>
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <Image
              src="/placeholder.svg"
              alt="Project 3"
              width={400}
              height={300}
              className="w-full"
            />
            <div className="p-4">
              <h3 className="font-semibold mb-2 text-[#212A31]">
                Project Title
              </h3>
              <p className="text-[#748D92]">Short project description</p>
            </div>
          </div>
        </div>
      </section>

      <section className="text-center mb-12">
        <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">
          Our Services
        </h2>
        <p className="text-[#748D92] mb-6">
          Discover how ThreadQuirk can bring your vision to life
        </p>
        <Link
          href="/services"
          className="bg-[#124E66] text-[#D3D9D4] px-6 py-2 rounded-full hover:bg-[#2E3944] transition-colors"
        >
          Explore Our Services
        </Link>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">
          Client Testimonials
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Testimonial cards */}
          <div className="bg-[#D3D9D4] p-6 rounded-lg">
            <p className="italic mb-4 text-[#212A31]">
              &quot;ThreadQuirk transformed our vision into reality. Their
              innovative designs exceeded our expectations!&quot;
            </p>
            <p className="font-semibold text-[#124E66]">
              - Jane Doe, Company XYZ
            </p>
          </div>
          <div className="bg-[#D3D9D4] p-6 rounded-lg">
            <p className="italic mb-4 text-[#212A31]">
              &quot;Working with ThreadQuirk was a game-changer for our brand.
              Their creativity and attention to detail are unmatched.&quot;
            </p>
            <p className="font-semibold text-[#124E66]">
              - John Smith, ABC Corp
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
