"use client";

import { RedBubble } from "@/app/components/Icons/RedBubble";
import { TeePublic } from "@/app/components/Icons/TeePublic";
import { TostaDora } from "@/app/components/Icons/TostaDora";
import { useContext } from "react";
import { ConfigContext } from "@/app/wrapper";

export default function ShopLinks() {
  const config = useContext(ConfigContext);

  return (
    <>
      <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">Our Shops</h2>
      <div className="flex justify-left space-x-4">
        {config.representation.redbuble && (
          <a
            href={config.representation.redbuble}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
          >
            <RedBubble size={24} />
            <span className="sr-only">Redbuble</span>
          </a>
        )}
        {config.representation.teepublic && (
          <a
            href={config.representation.teepublic}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
          >
            <TeePublic size={24} />
            <span className="sr-only">Teepublic</span>
          </a>
        )}
        {config.representation.tostadora && (
          <a
            href={config.representation.tostadora}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
          >
            <TostaDora size={24} />
            <span className="sr-only">Tostadora</span>
          </a>
        )}
      </div>
    </>
  );
}
