"use client";

import React from "react";
import { Design } from "@/types/design";
import { DesignCard } from "@/app/components/DesignCard";

type FeaturedDesignsProps = {
  title: string;
  designs: Design[];
};

export default function FeaturedDesigns({
  title,
  designs,
}: FeaturedDesignsProps) {
  return designs.length > 0 ? (
    <section className="mb-12">
      <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {designs.map((design) => (
          <DesignCard key={design.id} design={design} />
        ))}
      </div>
    </section>
  ) : null;
}
