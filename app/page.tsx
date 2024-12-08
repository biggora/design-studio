'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Helmet } from 'react-helmet-async'
import Slider from 'react-slick'
import "slick-carousel/slick/slick.css"
import "slick-carousel/slick/slick-theme.css"
import { useEffect, useState } from 'react'
import { supabase } from "@/utils/supabase"
import { Print } from "@/types/print"

import Slide1 from '../static/images/SHOP1_00002.png'
import Slide2 from '../static/images/TABLE_00001.png'
import Slide3 from '../static/images/T_SHIRT_1_00003.png'

const carouselItems = [
  {
    image: Slide1,
    title: 'Innovative Thread Designs',
    description: 'Pushing the boundaries of textile art and design'
  },
  {
    image: Slide2,
    title: 'Bespoke Creations',
    description: 'Tailored solutions for your unique vision'
  },
  {
    image: Slide3,
    title: 'Artistic Excellence',
    description: 'Where creativity meets craftsmanship'
  }
]

export default function Home() {
  const [featuredPrints, setFeaturedPrints] = useState<Print[]>([])

  useEffect(() => {
    async function fetchFeaturedPrints() {
      const { data, error } = await supabase
          .from('prints')
          .select('*')

      if (error) {
        console.error('Error fetching prints:', error)
        return
      }

      // Randomly select 3 prints
      const randomPrints = data.sort(() => 0.5 - Math.random()).slice(0, 3)
      setFeaturedPrints(randomPrints)
    }

    fetchFeaturedPrints()
  }, [])

  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 5000,
  }

  return (
      <>
        <Helmet>
          <title>ThreadQuirk - Innovative Design Studio</title>
          <meta name="description" content="ThreadQuirk is a cutting-edge design studio specializing in unique and quirky thread-based designs." />
          <meta name="keywords" content="thread art, textile design, innovative design, bespoke creations" />
        </Helmet>

        <section className="w-full -mt-16">
          <Slider {...settings}>
            {carouselItems.map((item, index) => (
                <div key={index} className="relative h-[calc(100vh-64px)]">
                  <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      style={{objectFit: 'cover'}}
                  />
                  <div className="absolute inset-0 bg-[#212A31] bg-opacity-60 flex flex-col justify-center items-center text-center p-4">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4 text-[#D3D9D4]">{item.title}</h2>
                    <p className="text-xl md:text-2xl text-[#748D92]">{item.description}</p>
                  </div>
                </div>
            ))}
          </Slider>
        </section>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <section className="text-center mb-12 bg-[#212A31] text-[#D3D9D4] py-16 rounded-lg">
            <h1 className="text-4xl font-bold mb-4">Welcome to ThreadQuirk</h1>
            <p className="text-xl text-[#748D92]">Weaving innovation into every design</p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">Featured Prints</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredPrints.map((print) => (
                  <div key={print.id} className="bg-white shadow-md rounded-lg overflow-hidden">
                    <Image
                        src={print.externalImageUrl || "/placeholder.svg"}
                        alt={print.title}
                        width={400}
                        height={300}
                        className="w-full h-[200px] object-cover"
                    />
                    <div className="p-4">
                      <h3 className="font-semibold mb-2 text-[#212A31]">{print.title}</h3>
                      <p className="text-[#748D92]">{print.description.substring(0, 100)}...</p>
                      <Link href={`/prints/${print.id}`} className="text-[#124E66] hover:underline mt-2 inline-block">
                        View Details
                      </Link>
                    </div>
                  </div>
              ))}
            </div>
          </section>

          <section className="text-center mb-12">
            <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">Our Services</h2>
            <p className="text-[#748D92] mb-6">Discover how ThreadQuirk can bring your vision to life</p>
            <Link
                href="/services"
                className="bg-[#124E66] text-[#D3D9D4] px-6 py-2 rounded-full hover:bg-[#2E3944] transition-colors"
            >
              Explore Our Services
            </Link>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">Client Testimonials</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#D3D9D4] p-6 rounded-lg">
                <p className="italic mb-4 text-[#212A31]">&quot;ThreadQuirk transformed our vision into reality. Their innovative designs exceeded our expectations!&quot;</p>
                <p className="font-semibold text-[#124E66]">- Jane Doe, Company XYZ</p>
              </div>
              <div className="bg-[#D3D9D4] p-6 rounded-lg">
                <p className="italic mb-4 text-[#212A31]">&quot;Working with ThreadQuirk was a game-changer for our brand. Their creativity and attention to detail are unmatched.&quot;</p>
                <p className="font-semibold text-[#124E66]">- John Smith, ABC Corp</p>
              </div>
            </div>
          </section>
        </div>
      </>
  )
}