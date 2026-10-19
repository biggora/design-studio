import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/app/components/PageShell";

const BAND_TONES = {
  field: "bg-background",
  alt: "bg-surface",
  deep: "bg-secondary",
} as const;

type BandProps = HTMLAttributes<HTMLElement> & {
  /** Graphite band tone (DESIGN.md): field = page background, alt = raised band, deep = darkest band. */
  tone?: keyof typeof BAND_TONES;
  /** Adds the woven-texture ember glow (hero and philosophy bands). */
  texture?: boolean;
  /** Classes for the inner PageShell container (vertical rhythm, stacking). */
  contentClassName?: string;
};

/**
 * Full-width page band: a graphite tone (optionally with the woven texture)
 * wrapping the standard container. Bands own the generous section rhythm
 * (`py-16`); override it per band via `contentClassName`.
 */
export function Band({
  tone = "field",
  texture = false,
  contentClassName,
  className,
  children,
  ...props
}: BandProps) {
  return (
    <section className={cn(texture && "texture-weave", BAND_TONES[tone], className)} {...props}>
      <PageShell className={cn("py-16", contentClassName)}>{children}</PageShell>
    </section>
  );
}
