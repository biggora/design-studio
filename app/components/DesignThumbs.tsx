import { Design } from "@/types/design";
import { DesignImage } from "@/app/components/DesignImage";
import { cn, safeHexColor } from "@/lib/utils";

type DesignThumbsProps = {
  /** Up to three are shown; absent or empty renders nothing. */
  designs?: Design[];
  className?: string;
};

/**
 * Decorative portrait thumbnails for index cards — the catalog card's 3:4
 * object-cover fill over the baked background color, repeated up to
 * three times inside a link whose text already names the target.
 */
export function DesignThumbs({ designs, className }: DesignThumbsProps) {
  const shown = (designs ?? []).slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <div className={cn("grid grid-cols-3 gap-1.5", className)} aria-hidden="true">
      {shown.map((design) => (
        <div
          key={design.id}
          className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted"
          style={{ backgroundColor: safeHexColor(design.backgroundColor) }}
        >
          <DesignImage design={design} alt="" fill sizes="120px" className="object-cover object-center" />
        </div>
      ))}
    </div>
  );
}
