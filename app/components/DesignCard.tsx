import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Design } from "@/types/design";
import { Card, CardContent } from "@/components/ui/card";
import { AccentLink } from "@/app/components/AccentLink";
import { designPath } from "@/lib/slug";
import { getDesignDisplayImage, imageBlurPlaceholder } from "@/lib/image";
import { cn, safeHexColor } from "@/lib/utils";
import { collectionPath } from "@/lib/collections";
import { buttonVariants } from "@/components/ui/button";

type DesignCardProps = {
  design: Design;
  /** Hide the collection caption (e.g. inside a section already titled by that collection). */
  showCollection?: boolean;
  compactOnMobile?: boolean;
};

export function DesignCard({ design, showCollection = true, compactOnMobile = false }: DesignCardProps) {
  const imageUrl =
    getDesignDisplayImage(design).trim() || "/images/no_image_available.svg";

  return (
    <Card className="group border border-border">
      <div className={cn("p-4 pb-0", compactOnMobile && "p-3 sm:p-4 sm:pb-0")}>
        <AccentLink
          href={designPath(design)}
          className="block overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={-1}
          aria-hidden="true"
        >
          <div
            className="relative w-full aspect-[3/4]"
            style={{ backgroundColor: safeHexColor(design.backgroundColor) }}
          >
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes={`(max-width: 640px) ${compactOnMobile ? "50vw" : "100vw"}, (max-width: 768px) 50vw, (max-width: 1280px) 33vw, 30vw`}
              placeholder="blur"
              blurDataURL={imageBlurPlaceholder}
              className="object-contain transition-transform duration-300 ease-out group-hover:scale-[1.4]"
            />
          </div>
        </AccentLink>
      </div>
      <CardContent className={cn("flex flex-col flex-grow p-4", compactOnMobile && "p-3 sm:p-4")}>
        <h2
          className={cn(
            "font-display mb-1 text-lg font-semibold leading-snug line-clamp-2",
            compactOnMobile && "mb-2 text-sm sm:mb-1 sm:text-lg",
          )}
        >
          <Link
            href={designPath(design)}
            className="text-foreground hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {design.title}
          </Link>
        </h2>
        {showCollection && design.collection && (
          <p className={cn("text-xs text-muted-foreground", compactOnMobile && "hidden sm:block")}>
            <AccentLink href={collectionPath(design.collection)}>
              {design.collection}
            </AccentLink>
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
