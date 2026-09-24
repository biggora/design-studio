import { Metadata } from "next";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { getSiteConfig } from "@/utils/database";
import { SiteConfig } from "@/lib/store";

export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();
  const title = `Our Services - ${config.name}`;
  const description =
    "Explore original print-on-demand designs for t-shirts, hoodies and other merch, available on Redbubble, TeePublic and Tostadora, plus custom design requests.";

  return {
    title,
    description,
    alternates: { canonical: "/services" },
    openGraph: {
      url: `https://${config.domain}/services`,
      type: "website",
      title,
      description,
    },
    twitter: {
      title,
      description,
    },
  };
}

const services = [
  {
    title: "Original Print-on-Demand Designs",
    description:
      "Original artwork created for t-shirts, hoodies and other everyday merch.",
    features: [
      "New designs added regularly",
      "Made for t-shirts, hoodies and more",
      "Printed on demand, no minimum order",
    ],
  },
  {
    title: "Themed Design Collections",
    description:
      "Designs grouped into collections by theme, so it's easy to find something that fits.",
    features: [
      "Browse by collection",
      "Consistent style across a collection",
      "Easy to find a matching gift",
    ],
  },
  {
    title: "Custom Design Requests",
    description:
      "Have an idea in mind? Tell us about it through our contact form.",
    features: [
      "Personal messages and themes",
      "Collaborative ideation",
      "AI-assisted concepts refined by designers",
    ],
  },
];

export default async function Services() {
  const config: SiteConfig = await getSiteConfig();
  return (
    <>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold mb-8">Our Services</h1>
        <p className="text-gray-600 mb-8">
          {config.name} creates original designs and turns them into
          print-on-demand apparel and merch, sold through our marketplace
          partners.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => (
            <div key={index} className="bg-white shadow-md rounded-lg p-6">
              <h2 className="text-2xl font-semibold mb-4">{service.title}</h2>
              <p className="text-gray-600 mb-4">{service.description}</p>
              <ul className="space-y-2">
                {service.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center">
                    <CheckCircle className="text-green-500 mr-2" size={20} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <h2 className="text-2xl font-semibold mb-4">Where to Buy</h2>
          <p className="text-gray-600 mb-4">
            Our designs are printed and shipped by our marketplace partners,
            including Redbubble, TeePublic and Tostadora.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/designs" className="text-[#124E66] hover:underline">
              Browse our designs
            </Link>
            <Link
              href="/contact"
              className="bg-[#212A31] text-[#D3D9D4] px-4 py-2 rounded"
            >
              Request a custom design
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
