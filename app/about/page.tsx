"use client";

import { useContext } from "react";
import { ConfigContext } from "@/app/wrapper";

export default function About() {
  const config = useContext(ConfigContext);
  return (
    <>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-3">
        <h1 className="text-4xl font-bold mb-8 text-[#212A31]">
          About {config.name}
        </h1>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Our Story</h2>
          <p className="text-gray-700 mb-4">
            {config.name} was founded in 2024 with a vision to revolutionize the
            world of design through innovative use AI tools. Our journey began
            with a small team of passionate designers who believed in the power
            of unconventional tools to create stunning visual narratives.
          </p>
          <p className="text-gray-700">
            At {config.name}, we believe that fashion is more than just
            clothing—it&#39;s a reflection of your personality and passions. Our
            mission is to transform everyday apparel into bold statements of
            individuality and creativity.
          </p>
          <p className="text-gray-700">
            We’ve assembled a talented team of designers who thrive on turning
            imaginative ideas into wearable art. Whether you&#39;re looking for
            a quirky design, a heartfelt message, or a bold statement piece, our
            collections are crafted to inspire and empower your unique style.
          </p>
          <p className="text-gray-700">
            From versatile t-shirts and cozy hoodies to timeless polos, our wide
            range of products ensures there&#39;s something for everyone. With
            {config.name}, you’re not just wearing clothes; you’re wearing your
            story.
          </p>
          <p className="text-gray-700">
            Dare to be different, celebrate your quirks, and let your fashion do
            the talking—because at {config.name}, individuality is always in
            style.
          </p>
        </section>

        {/*<section className="mb-12">*/}
        {/*  <h2 className="text-2xl font-semibold mb-4">Our Team</h2>*/}
        {/*  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">*/}
        {/*    /!* Add team member cards here *!/*/}
        {/*    <div className="text-center">*/}
        {/*      <Image*/}
        {/*        alt="Team Member"*/}
        {/*        src={NoImagesAvailable}*/}
        {/*        className="w-48 h-48 rounded-full mx-auto mb-4"*/}
        {/*      />*/}
        {/*      <h3 className="font-semibold">Jane Doe</h3>*/}
        {/*      <p className="text-gray-600">Founder & Creative Director</p>*/}
        {/*    </div>*/}
        {/*    /!* Repeat for other team members *!/*/}
        {/*  </div>*/}
        {/*</section>*/}

        <section className="pb-3">
          <h2 className="text-2xl font-semibold mb-4">Our Approach</h2>
          <p className="text-gray-700 mb-4">
            At {config.name}, we believe that great design is born from a
            perfect blend of creativity, technical skill, and a deep
            understanding of our clients&apos; needs. Our approach is rooted in:
          </p>
          <ul className="list-disc list-inside text-gray-700 mb-4">
            <li>Collaborative ideation with our clients</li>
            <li>Extensive research and experimentation with AI Tools</li>
            <li>Sustainable design practices</li>
            <li>Continuous learning and adaptation to emerging trends</li>
          </ul>
          <p className="text-gray-700 pb-5">
            This approach allows us to create designs that are not only visually
            striking but also meaningful and impactful.
          </p>
        </section>
      </div>
    </>
  );
}
