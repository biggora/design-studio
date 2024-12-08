"use client";

import { Helmet } from "react-helmet-async";
import Image from "next/image";
import NoImagesAvailable from "../../static/images/no_image_available.svg";

export default function About() {
  return (
    <>
      <Helmet>
        <title>About ThreadQuirk - Our Story and Approach</title>
        <meta
          name="description"
          content="Learn about ThreadQuirk's journey, our passionate team, and our innovative approach to thread-based design."
        />
        <meta
          name="keywords"
          content="ThreadQuirk, about us, design studio, thread art, textile innovation"
        />
      </Helmet>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold mb-8 text-[#212A31]">
          About ThreadQuirk
        </h1>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Our Story</h2>
          <p className="text-gray-700 mb-4">
            ThreadQuirk was founded in 2020 with a vision to revolutionize the
            world of design through innovative use of threads and textiles. Our
            journey began with a small team of passionate designers who believed
            in the power of unconventional materials to create stunning visual
            narratives.
          </p>
          <p className="text-gray-700">
            Today, we&apos;ve grown into a diverse team of creatives, each
            bringing unique perspectives and skills to the table. Our commitment
            to pushing the boundaries of design remains at the core of
            everything we do.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Our Team</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Add team member cards here */}
            <div className="text-center">
              <Image
                alt="Team Member"
                src={NoImagesAvailable}
                className="w-48 h-48 rounded-full mx-auto mb-4"
              />
              <h3 className="font-semibold">Jane Doe</h3>
              <p className="text-gray-600">Founder & Creative Director</p>
            </div>
            {/* Repeat for other team members */}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Our Approach</h2>
          <p className="text-gray-700 mb-4">
            At ThreadQuirk, we believe that great design is born from a perfect
            blend of creativity, technical skill, and a deep understanding of
            our clients&apos; needs. Our approach is rooted in:
          </p>
          <ul className="list-disc list-inside text-gray-700 mb-4">
            <li>Collaborative ideation with our clients</li>
            <li>Extensive research and experimentation with materials</li>
            <li>Sustainable design practices</li>
            <li>Continuous learning and adaptation to emerging trends</li>
          </ul>
          <p className="text-gray-700">
            This approach allows us to create prints that are not only visually
            striking but also meaningful and impactful.
          </p>
        </section>
      </div>
    </>
  );
}
