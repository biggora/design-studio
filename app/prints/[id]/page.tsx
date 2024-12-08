"use client";

import Image from "next/image";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/utils/supabase";
import { useEffect, useState } from "react";
import { Print } from "@/types/print";

async function getPrintById(id: string) {
  const { data, error } = await supabase
    .from("prints")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching print:", error);
    return null;
  }

  return data;
}

export default function PrintDetails({ params }: { params: { id: string } }) {
  const [print, setPrint] = useState<Print | null>(null);

  const goToLink = (url: string) => {
    window.open(url, "_blank");
  };

  useEffect(() => {
    async function fetchPrint() {
      const printData = await getPrintById(params.id);
      setPrint(printData);
    }
    fetchPrint();
  }, [params.id]);

  if (!print) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  return (
    <>
      <Helmet>
        <title>{`${print.title} - ThreadQuirk Print`}</title>
        <meta
          name="description"
          content={`Discover the unique ${print.title} print by ThreadQuirk. ${print.description}`}
        />
        <meta
          name="keywords"
          content={`${print.keywords}, thread art, textile design, ThreadQuirk print`}
        />
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
                src={print.externalImageUrl || "/placeholder.svg"}
                alt={print.title}
                width={900}
                height={600}
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
    </>
  );
}
