"use client";

import Image from "next/image";
import Link from "next/link";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/utils/supabase";
import { useContext, useEffect, useState } from "react";
import { Design } from "@/types/design";
import {
  getPlaceholderImage,
  designCardHeight,
  designCardWidth,
} from "@/lib/image";
import { formatDate, truncateText } from "@/lib/utils";
import { ConfigContext } from "@/app/wrapper";

async function getDesignById(id: string) {
  const { data: design, error } = await supabase
    .from("designs")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching design:", error);
    return null;
  }

  // Fetch related designs from the same collection
  const { data: relatedDesigns, error: relatedError } = await supabase
    .from("designs")
    .select("*")
    .eq("collection", design.collection)
    .neq("id", id)
    .limit(3);

  if (relatedError) {
    console.error("Error fetching related designs:", relatedError);
  }

  return { design, relatedDesigns: relatedDesigns || [] };
}

export default function DesignDetails({ params }: { params: { id: string } }) {
  const config = useContext(ConfigContext);
  const [design, setDesign] = useState<Design | null>(null);
  const [relatedDesigns, setRelatedDesigns] = useState<Design[]>([]);

  const goToLink = (url: string) => {
    window.open(url, "_blank");
  };

  useEffect(() => {
    async function fetchDesign() {
      const data = await getDesignById(params.id);
      if (data) {
        setDesign(data.design);
        setRelatedDesigns(data.relatedDesigns);
      }
    }
    void fetchDesign();
  }, [params.id]);

  if (!design) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  const designTitle = `${design.title} - ${config.name} design`;

  return (
    <>
      <Helmet>
        <title>{designTitle}</title>
        <meta
          name="description"
          content={`Discover the unique design. ${design.description}`}
        />
        <meta
          name="keywords"
          content={`${design.keywords}, ${config.keywords}`}
        />
        <meta property="og:title" content={designTitle} />
        <meta
          property="twitter:image"
          content={design.externalImageUrl || getPlaceholderImage(900, 600)}
        />
        <meta
          property="og:image"
          content={design.externalImageUrl || getPlaceholderImage(900, 600)}
        />
        <meta
          property="og:url"
          content={`https://${config.domain}/designs/${design.id}`}
        />
        <meta property="og:type" content="website" />
        <meta property="og:description" content={design.description} />
        <meta property="og:site_name" content={designTitle} />
        <meta property="og:locale" content="en_US" />
      </Helmet>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/designs"
          className="text-[#124E66] hover:underline mb-4 inline-block"
        >
          &larr; Back to Designs
        </Link>
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative h-0 pb-[66.67%] md:pb-0 md:h-full">
              <Image
                src={design.externalImageUrl || getPlaceholderImage(900, 600)}
                alt={design.title}
                width={designCardWidth}
                height={designCardHeight}
                className="object-cover w-full h-full"
              />
            </div>
            <div className="p-6">
              <h1 className="text-3xl font-bold mb-4 text-[#212A31]">
                {design.title}
              </h1>
              <p className="text-[#748D92] min-h-[200px] mb-6">{design.description}</p>
              {/*<div className="grid grid-cols-2 gap-4 mb-6">*/}
              {/*  <div>*/}
              {/*    <h2 className="text-xl font-semibold mb-2 text-[#212A31]">*/}
              {/*      Dimensions*/}
              {/*    </h2>*/}
              {/*    <p className="text-[#748D92]">{design.dimensions}</p>*/}
              {/*  </div>*/}
              {/*  <div>*/}
              {/*    <h2 className="text-xl font-semibold mb-2 text-[#212A31]">*/}
              {/*      Material*/}
              {/*    </h2>*/}
              {/*    <p className="text-[#748D92]">{design.material}</p>*/}
              {/*  </div>*/}
              {/*  <div>*/}
              {/*    <h2 className="text-xl font-semibold mb-2 text-[#212A31]">*/}
              {/*      Price*/}
              {/*    </h2>*/}
              {/*    <p className="text-[#748D92]">${design.price}</p>*/}
              {/*  </div>*/}
              {/*  <div>*/}
              {/*    <h2 className="text-xl font-semibold mb-2 text-[#212A31]">*/}
              {/*      Availability*/}
              {/*    </h2>*/}
              {/*    <p className="text-[#748D92]">*/}
              {/*      {design.inStock ? "In Stock" : "Out of Stock"}*/}
              {/*    </p>*/}
              {/*  </div>*/}
              {/*</div>*/}
              <p className="text-[#748D92] mb-4">
                Created on: {formatDate(design.createdAt)}
              </p>
              <button
                onClick={() => {
                  goToLink(design?.externalLink);
                }}
                className="w-full bg-[#124E66] text-white px-6 py-2 rounded-md hover:bg-[#2E3944] transition-colors"
              >
                Shop products with this design
              </button>
            </div>
          </div>
        </div>
      </div>
      {relatedDesigns.length > 0 && (
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mt-12">
              <h2 className="text-2xl font-bold mb-6 text-[#212A31]">
                More from this collection
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {relatedDesigns.map((relatedDesign: Design) => (
                    <div
                        key={relatedDesign.id}
                        className="bg-white shadow-md rounded-lg overflow-hidden"
                    >
                      <Image
                          src={
                              relatedDesign.externalImageUrl ||
                              getPlaceholderImage(designCardWidth, designCardHeight)
                          }
                          alt={relatedDesign.title}
                          width={designCardWidth}
                          height={designCardHeight}
                          className={`w-full h-[${designCardWidth}px] object-cover`}
                      />
                      <div className="p-4">
                        <h3 className="font-semibold mb-2 text-[#212A31]">
                          {relatedDesign.title}
                        </h3>
                        <p className="text-[#748D92] mb-2">
                          {truncateText(relatedDesign.description, 100)}
                        </p>
                        <Link
                            href={`/designs/${relatedDesign.id}`}
                            className="text-[#124E66] hover:underline"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                ))}
              </div>
            </div>
          </div>
      )}
    </>
  );
}
