import React from "react";
import { Design } from "@/types/design";
import { DesignCard } from "@/app/components/DesignCard";
import { CardGrid } from "@/app/components/CardGrid";
import { SectionHeading } from "@/app/components/SectionHeading";
import {cn} from "@/lib/utils";

type FeaturedDesignsProps = {
  title: string;
  designs?: Design[];
  /** Passed down to cards: hide the collection row when the section title already names it. */
  showCollection?: boolean;
  compactOnMobile?: boolean;
  /** Raw collection name → canonical display name for card captions. */
  collectionLabels?: Map<string, string>;
};

export default function FeaturedDesigns({
  title,
  designs,
  showCollection = true,
  compactOnMobile = false,
  collectionLabels,
}: FeaturedDesignsProps) {
  return designs && designs.length > 0 ? (
    <section className="mb-12">
      <SectionHeading>{title}</SectionHeading>
      <CardGrid className={cn(compactOnMobile && "grid-cols-2 gap-3 sm:gap-6")}>
        {designs.map((design) => (
          <DesignCard
            key={design.id}
            design={design}
            showCollection={showCollection}
            compactOnMobile={compactOnMobile}
            collectionLabels={collectionLabels}
          />
        ))}
      </CardGrid>
    </section>
  ) : null;
}
