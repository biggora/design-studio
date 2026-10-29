import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Design } from "@/types/design";
import { Card, CardContent } from "@/components/ui/card";
import { AccentLink } from "@/app/components/AccentLink";
import { DesignImage } from "@/app/components/DesignImage";
import { designPath } from "@/lib/slug";
import { cn, focusRingClasses, safeHexColor } from "@/lib/utils";
import { collectionPath } from "@/lib/collections";
import { buttonVariants } from "@/components/ui/button";
import type { TshirtOffer } from "@/lib/marketplace-prices";

type DesignCardProps = {
  design: Design;
  /** Hide the collection caption (e.g. inside a section already titled by that collection). */
  showCollection?: boolean;
  compactOnMobile?: boolean;
  /** Start first-screen artwork immediately; later cards stay lazy. */
  priority?: boolean;
  /** Override the default five-column catalog ladder (e.g. home's three-column grid). */
  sizes?: string;
  /** Raw collection name → canonical display name (curated heading). */
  collectionLabels?: Map<string, string>;
  tshirtOffer?: TshirtOffer;
};

export function DesignCard({ design, showCollection = true, compactOnMobile = false, priority, sizes, collectionLabels, tshirtOffer }: DesignCardProps) {
  const collectionLabel =
    (design.collection && collectionLabels?.get(design.collection)) || design.collection;

  return (
    <Card className="group border border-border">
      <div className={cn("p-4 pb-0", compactOnMobile && "p-3 sm:p-4 sm:pb-0")}>
        <AccentLink
          href={designPath(design)}
          className={cn("block overflow-hidden rounded-md", focusRingClasses)}
          tabIndex={-1}
        >
          <div
            className="relative w-full aspect-[3/4]"
            style={{ backgroundColor: safeHexColor(design.backgroundColor) }}
          >
            <DesignImage
              design={design}
              alt={design.title}
              fill
              priority={priority}
              // Container caps, gutters, grid gaps and card padding from PageShell/CardGrid.
              sizes={sizes ?? `(min-width: 1536px) 242px, (min-width: 1280px) 190px, (min-width: 1024px) 188px, (min-width: 768px) 190px, (min-width: 640px) 250px, ${compactOnMobile ? "calc(50vw - 48px)" : "calc(100vw - 66px)"}`}
              className="object-cover object-center transition-transform duration-300 ease-out group-hover:scale-[1.4]"
            />
          </div>
        </AccentLink>
      </div>
      <CardContent className={cn("flex flex-col flex-grow p-4", compactOnMobile && "p-3 sm:p-4")}>
        {/* Unclamped below sm — the 2-up mobile catalog reads the full punchline;
            desktop grids cap at three lines. */}
        <h2
          className={cn(
            "font-display mb-1 text-lg font-semibold leading-snug sm:line-clamp-3",
            compactOnMobile && "mb-2 text-sm sm:mb-1 sm:text-lg",
          )}
        >
          <Link
            href={designPath(design)}
              className={cn("text-foreground hover:text-accent transition-colors", focusRingClasses)}
          >
            {design.title}
          </Link>
        </h2>
        {showCollection && design.collection && (
          <p className={cn("text-xs text-muted-foreground", compactOnMobile && "hidden sm:block")}>
            <Link
              href={collectionPath(design.collection)}
              className={cn("transition-colors hover:text-accent", focusRingClasses)}
            >
              {collectionLabel}
            </Link>
          </p>
        )}
        <p
          className={cn(
            "mt-2 mb-4 text-sm text-muted-foreground line-clamp-3",
            compactOnMobile && "hidden sm:mt-2 sm:mb-4 sm:line-clamp-3",
          )}
        >
          {design.description}
        </p>
        {tshirtOffer && (
          <p className="mb-3 text-sm text-foreground">
            T-shirt · <span className="font-semibold tabular-nums">{new Intl.NumberFormat("en", {style: "currency", currency: tshirtOffer.currency}).format(Number(tshirtOffer.price))} {tshirtOffer.currency}</span>
            <span className="block text-xs text-muted-foreground">
              {tshirtOffer.seller}{tshirtOffer.availability === "https://schema.org/OutOfStock" || tshirtOffer.availability === "https://schema.org/SoldOut" ? " · Out of stock" : ""}
            </span>
          </p>
        )}
        <Link
          href={designPath(design)}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm", className: "mt-auto self-start gap-2" }),
            compactOnMobile && "hidden sm:inline-flex",
          )}
        >
          View design
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
