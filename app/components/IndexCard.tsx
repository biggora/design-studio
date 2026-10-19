import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Design } from "@/types/design";
import { DesignThumbs } from "@/app/components/DesignThumbs";
import { cn, focusRingClasses } from "@/lib/utils";

type IndexCardProps = ComponentProps<typeof Link> & {
  title: string;
  description: string;
  /** Artwork previews (up to three portrait thumbs); absent renders text only. */
  thumbs?: Design[];
  /** Trailing meta line (e.g. the design count). */
  meta?: ReactNode;
};

/**
 * Index-page link card (the collections and gifts directories): artwork
 * thumbs over the panel skin, title, description, optional meta line.
 * `h-full` keeps cards equal-height inside the CardGrid `ul`.
 */
export function IndexCard({ title, description, thumbs, meta, className, ...props }: IndexCardProps) {
  return (
    <Link
      className={cn(
        "block h-full rounded-lg border border-border bg-card p-4 hover:border-accent",
        focusRingClasses,
        className,
      )}
      {...props}
    >
      <DesignThumbs designs={thumbs} className="mb-3" />
      <span className="block text-xl font-semibold mb-2 text-foreground">{title}</span>
      <span className="block text-muted-foreground">{description}</span>
      {meta != null && <span className="mt-2 block text-sm text-muted-foreground">{meta}</span>}
    </Link>
  );
}
