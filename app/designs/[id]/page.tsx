import Image from "next/image";
import Link from "next/link";
import { getSiteConfig, supabase } from "@/utils/supabase";
import { Design } from "@/types/design";
import {
  getPlaceholderImage,
  designCardHeight,
  designCardWidth,
} from "@/lib/image";
import {
  formatDate,
  getRedBubbleDesignPageLink,
  truncateText,
} from "@/lib/utils";
import { Metadata } from "next";
import { SiteConfig } from "@/lib/store";
import FeaturedDesigns from "@/app/components/FeaturedDesigns";
import ShopLinks from "@/app/components/ShopLinks";
import ShareLinks from "@/app/components/ShareLinks";

type Props = {
  params: { id: string };
};

type DesignDetailsProps = {
  design: Design;
  relatedDesigns: Design[];
};

async function getDesignById(id: string): Promise<DesignDetailsProps | null> {
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = params.id;
  const data = await getDesignById(id);
  const config: SiteConfig = await getSiteConfig();

  if (!data || !data.design) {
    return {
      title: "Design Not Found",
    };
  }

  const { design } = data;
  const title = `${design.title} - ${config.name} Design`;
  const description = `Discover the unique ${design.title} design by ${config.name}. ${truncateText(design.description, 180)}`;
  return {
    title,
    description,
    keywords: `${design.keywords}, art, t-shirt design, ${config.name} design`,
    openGraph: {
      url: `https://${config.domain}/designs/${id}`,
      type: "website",
      title,
      description,
      images: [design.externalImageUrl],
    },
  };
}

export default async function DesignDetails({
  params,
}: {
  params: { id: string };
}) {
  const config: SiteConfig = await getSiteConfig();
  const data = await getDesignById(params.id);

  if (!data || !data.design) {
    return <div className="container mx-auto px-4 py-8">Design not found</div>;
  }

  const { design, relatedDesigns } = data;

  if (!design) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>;
  }

  const shareUrl = `https://${config.domain}/prints/${params.id}`; // Replace with your actual domain
  const shareText = `Check out this amazing design: ${design.title} by ${config.name}`;

  return (
    <>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/designs"
          className="text-[#124E66] hover:underline mb-4 inline-block"
        >
          &larr; Back to Designs
        </Link>
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative md:pb-0 md:h-full">
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
              <p className="text-[#748D92] min-h-[200px] mb-6">
                {design.description}
              </p>
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
              <div className={`grid grid-cols-1 md:grid-cols-2`}>
                <p className="text-[#748D92] mb-4">
                  Collection:&nbsp;
                  <Link
                    href={`/designs?collection=${design.collection}&page=1`}
                  >
                    {design.collection}
                  </Link>
                </p>
                <p className="text-[#748D92] mb-4 lg:text-right">
                  Created on: {formatDate(design.createdAt)}
                </p>
              </div>
              <a
                href={design?.externalLink}
                target={design?.externalLink ? "_blank" : "_self"}
                className="w-full block text-center bg-[#124E66] text-white px-6 py-2 rounded-md hover:bg-[#2E3944] transition-colors"
              >
                Shop products with this design
              </a>
              <div className={`grid grid-cols-2 grid-md-cols-2`}>
                <div className="flex justify-start items-center space-x-4 mt-4">
                  <ShareLinks
                    shareText={shareText}
                    shareUrl={shareUrl}
                    imageUrl={design.externalImageUrl}
                  />
                </div>
                <div className="flex justify-end items-center space-x-4 mt-4">
                  <ShopLinks
                    title="Our Shops"
                    styleTitle={" "}
                    redBubble={getRedBubbleDesignPageLink(design.externalId)}
                  />
                </div>
              </div>
              {/**/}
            </div>
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FeaturedDesigns
          title="More from this collection"
          designs={relatedDesigns}
        />
      </div>
    </>
  );
}
