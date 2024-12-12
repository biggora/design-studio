"use client";

import Image from "next/image";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/utils/supabase";
import { useContext, useEffect, useState } from "react";
import { Print } from "@/types/print";
import {
  getPlaceholderImage,
  printCardHeight,
  printCardWidth,
} from "@/lib/image";
import { formatDate, truncateText } from "@/lib/utils";
import { ConfigContext } from "@/app/wrapper";

async function getPrintById(id: string) {
  const { data: print, error } = await supabase
    .from("prints")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching print:", error);
    return null;
  }

  // Fetch related prints from the same collection
  const { data: relatedPrints, error: relatedError } = await supabase
    .from("prints")
    .select("*")
    .eq("collection", print.collection)
    .neq("id", id)
    .limit(3);

  if (relatedError) {
    console.error("Error fetching related prints:", relatedError);
  }

  return { print, relatedPrints: relatedPrints || [] };
}

export default function PrintDetails({ params }: { params: { id: string } }) {
  const config = useContext(ConfigContext);
  const [print, setPrint] = useState<Print | null>(null);
  const [relatedPrints, setRelatedPrints] = useState<Print[]>([]);

  const goToLink = (url: string) => {
    window.open(url, "_blank");
  };

  useEffect(() => {
    async function fetchPrint() {
      const data = await getPrintById(params.id);
      if (data) {
        setPrint(data.print);
        setRelatedPrints(data.relatedPrints);
      }
    }
    fetchPrint();
  }, [params.id]);

  if (!print) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  const printTitle = `${print.title} - ${config.name} Print`;

  return (
    <>
      <Helmet>
        <title>{printTitle}</title>
        <meta
          name="description"
          content={`Discover the unique print. ${print.description}`}
        />
        <meta
          name="keywords"
          content={`${print.keywords}, ${config.keywords}`}
        />
        <meta property="og:title" content={printTitle} />
        <meta
          property="twitter:image"
          content={print.externalImageUrl || getPlaceholderImage(900, 600)}
        />
        <meta
          property="og:image"
          content={print.externalImageUrl || getPlaceholderImage(900, 600)}
        />
        <meta
          property="og:url"
          content={`https://${config.domain}/prints/${print.id}`}
        />
        <meta property="og:type" content="website" />
        <meta property="og:description" content={print.description} />
        <meta property="og:site_name" content={printTitle} />
        <meta property="og:locale" content="en_US" />
      </Helmet>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/prints"
          className="text-[#124E66] hover:underline mb-4 inline-block"
        >
          &larr; Back to Prints
        </Link>
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative h-0 pb-[66.67%] md:pb-0 md:h-full">
              <Image
                src={print.externalImageUrl || getPlaceholderImage(900, 600)}
                alt={print.title}
                width={printCardWidth}
                height={printCardHeight}
                className="object-cover w-full h-full"
              />
            </div>
            <div className="p-6">
              <h1 className="text-3xl font-bold mb-4 text-[#212A31]">
                {print.title}
              </h1>
              <p className="text-[#748D92] mb-6">{print.description}</p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2 text-[#212A31]">
                    Dimensions
                  </h2>
                  <p className="text-[#748D92]">{print.dimensions}</p>
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-2 text-[#212A31]">
                    Material
                  </h2>
                  <p className="text-[#748D92]">{print.material}</p>
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-2 text-[#212A31]">
                    Price
                  </h2>
                  <p className="text-[#748D92]">${print.price}</p>
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-2 text-[#212A31]">
                    Availability
                  </h2>
                  <p className="text-[#748D92]">
                    {print.inStock ? "In Stock" : "Out of Stock"}
                  </p>
                </div>
              </div>
              <p className="text-[#748D92] mb-4">
                Created on: {formatDate(print.createdAt)}
              </p>
              <button
                onClick={() => {
                  goToLink(print?.externalLink);
                }}
                className="w-full bg-[#124E66] text-white px-6 py-2 rounded-md hover:bg-[#2E3944] transition-colors"
              >
                Shop products with this print
              </button>
            </div>
          </div>
        </div>
      </div>
      {relatedPrints.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6 text-[#212A31]">
            More from this collection
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {relatedPrints.map((relatedPrint) => (
              <div
                key={relatedPrint.id}
                className="bg-white shadow-md rounded-lg overflow-hidden"
              >
                <Image
                  src={
                    relatedPrint.externalImageUrl ||
                    getPlaceholderImage(printCardWidth, printCardHeight)
                  }
                  alt={relatedPrint.title}
                  width={printCardWidth}
                  height={printCardHeight}
                  className={`w-full h-[${printCardWidth}px] object-cover`}
                />
                <div className="p-4">
                  <h3 className="font-semibold mb-2 text-[#212A31]">
                    {relatedPrint.title}
                  </h3>
                  <p className="text-[#748D92] mb-2">
                    {truncateText(relatedPrint.description, 100)}
                  </p>
                  <Link
                    href={`/prints/${relatedPrint.id}`}
                    className="text-[#124E66] hover:underline"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
