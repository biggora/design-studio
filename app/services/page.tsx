"use client";

import { CheckCircle } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useContext } from "react";
import { ConfigContext } from "@/app/wrapper";

const services = [
  {
    title: "Custom Thread Art",
    description: "Bespoke artwork created using various threading techniques.",
    features: [
      "Personalized designs",
      "Multiple size options",
      "Framing available",
    ],
  },
  {
    title: "Textile Branding",
    description: "Unique branding solutions using textiles and threads.",
    features: [
      "Logo recreation",
      "Branded installations",
      "Textile business cards",
    ],
  },
  {
    title: "Interior Thread Design",
    description:
      "Innovative interior design solutions using threads and textiles.",
    features: ["Wall installations", "Furniture accents", "Room dividers"],
  },
  // Add more services as needed
];

export default function Services() {
  const config = useContext(ConfigContext);
  return (
    <>
      <Helmet>
        <title>Our Services - {config.name}</title>
        <meta
          name="description"
          content={`Explore ${config.name}'s range of innovative thread-based design services, from custom art to textile branding and interior design.`}
        />
        <meta
          name="keywords"
          content="thread art services, textile branding, interior thread design, custom artwork"
        />
      </Helmet>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold mb-8">Our Services</h1>

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
      </div>
    </>
  );
}
