"use client";

import { RedBubble } from "@/app/components/Icons/RedBubble";
import { TeePublic } from "@/app/components/Icons/TeePublic";
import { TostaDora } from "@/app/components/Icons/TostaDora";

type ShopLinksProps = {
  title: string;
  redBubble?: string;
  teePublic?: string;
  tostaDora?: string;
  styleTitle?: string;
};

export default function ShopLinks({
  title,
  redBubble,
  teePublic,
  tostaDora,
  styleTitle = "text-2xl mb-4",
}: ShopLinksProps) {
  return (
    <>
      <h2 className={`${styleTitle} font-semibold text-foreground`}>{title}</h2>
      <div className="flex justify-start space-x-4">
        {redBubble && (
          <a
            href={redBubble}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-accent transition-colors"
          >
            <RedBubble size={24} />
            <span className="sr-only">RedBubble</span>
          </a>
        )}
        {teePublic && (
          <a
            href={teePublic}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-accent transition-colors"
          >
            <TeePublic size={24} />
            <span className="sr-only">TeePublic</span>
          </a>
        )}
        {tostaDora && (
          <a
            href={tostaDora}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-accent transition-colors"
          >
            <TostaDora size={24} />
            <span className="sr-only">TostaDora</span>
          </a>
        )}
      </div>
    </>
  );
}
