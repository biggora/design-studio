"use client";

import { buttonVariants } from "@/components/ui/button";
import { SectionHeading } from "@/app/components/SectionHeading";

type ShopLinksProps = {
  title: string;
  redBubble?: string;
  teePublic?: string;
  tostaDora?: string;
};

// Redbubble/TeePublic links may be affiliate links (sponsored), Tostadora has
// no affiliate program — plain link.
const marketplaceLinks = [
  { key: "redbubble", label: "Buy on Redbubble", href: undefined as string | undefined, sponsored: true },
  { key: "teePublic", label: "Buy on TeePublic", href: undefined as string | undefined, sponsored: true },
  { key: "tostaDora", label: "Buy on Tostadora", href: undefined as string | undefined, sponsored: false },
] as const;

export default function ShopLinks({
  title,
  redBubble,
  teePublic,
  tostaDora,
}: ShopLinksProps) {
  const links = { redbubble: redBubble, teePublic, tostaDora };
  const configured = marketplaceLinks.filter((m) => links[m.key]);

  if (configured.length === 0) return null;

  return (
    <>
      {title.trim() && <SectionHeading>{title}</SectionHeading>}
      <div className="flex flex-wrap justify-start gap-3">
        {configured.map(({ key, label, sponsored }) => (
          <a
            key={key}
            href={links[key]}
            target="_blank"
            rel={sponsored ? "sponsored noopener noreferrer" : "noopener noreferrer"}
            className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2" })}
          >
            {label}
            <span aria-hidden="true">&#8599;</span>
          </a>
        ))}
      </div>
    </>
  );
}
