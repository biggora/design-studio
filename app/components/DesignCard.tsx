import Image from "next/image";
import Link from "next/link";
import { Design } from "@/types/design";
import { Card, CardContent } from "@/components/ui/card";
import { designPath } from "@/lib/slug";
import { getDesignDisplayImage, imageBlurPlaceholder } from "@/lib/image";
import { cn, safeHexColor } from "@/lib/utils";

type DesignCardProps = {
  design: Design;
  /** Hide the collection row (e.g. inside a section already titled by that collection). */
  showCollection?: boolean;
  compactOnMobile?: boolean;
};

export function DesignCard({ design, showCollection = true, compactOnMobile = false }: DesignCardProps) {
  const imageUrl =
    getDesignDisplayImage(design).trim() || "/images/no_image_available.svg";

  return (
    <Card key={design.id}>
      <Link
        href={designPath(design)}
        className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          className="relative w-full aspect-[3/4] overflow-hidden bg-muted"
          style={{ backgroundColor: safeHexColor(design.backgroundColor) }}
        >
          <Image
            src={imageUrl}
            alt={design.title}
            fill
            sizes={`(max-width: 640px) ${compactOnMobile ? "50vw" : "100vw"}, (max-width: 768px) 50vw, (max-width: 1280px) 25vw, 20vw`}
            placeholder="blur"
            blurDataURL={imageBlurPlaceholder}
            className="object-contain"
          />
        </div>
      </Link>
      <CardContent className={cn("p-4 flex flex-col flex-grow", compactOnMobile && "p-3 sm:p-4")}>
        <h2 className={cn("text-xl font-semibold mb-2 line-clamp-2", compactOnMobile && "text-sm sm:text-xl")}>
          <Link
            href={designPath(design)}
            className="text-foreground hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {design.title}
          </Link>
        </h2>
        <p className={cn("text-muted-foreground mb-4 line-clamp-3", compactOnMobile && "hidden sm:line-clamp-3")}>{design.description}</p>
        {showCollection && design.collection && (
          <p className={cn("text-muted-foreground mb-2", compactOnMobile && "hidden sm:block")}>
            Collection:&nbsp;
            <Link
              href={`/designs?collection=${encodeURIComponent(design.collection)}`}
              className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {design.collection}
            </Link>
          </p>
        )}
        <Link
          href={designPath(design)}
          className={cn("text-accent hover:underline mt-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", compactOnMobile && "hidden sm:block")}
        >
          View Design Details
        </Link>
      </CardContent>
    </Card>
  );
}
