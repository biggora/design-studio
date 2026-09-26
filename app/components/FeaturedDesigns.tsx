import React from "react";
import { Design } from "@/types/design";
import { DesignCard } from "@/app/components/DesignCard";

type FeaturedDesignsProps = {
  title: string;
  designs?: Design[];
  /** Passed down to cards: hide the collection row when the section title already names it. */
  showCollection?: boolean;
};

export default function FeaturedDesigns({
  title,
  designs,
  showCollection = true,
}: FeaturedDesignsProps) {
  return designs && designs.length > 0 ? (
    <section className="mb-12">
      <h2 className="text-2xl font-semibold mb-4 text-foreground">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {designs.map((design) => (
          <DesignCard
            key={design.id}
            design={design}
            showCollection={showCollection}
          />
        ))}
      </div>
    </section>
  ) : null;
}
