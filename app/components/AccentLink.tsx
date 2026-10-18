import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Accent text link (DESIGN.md "link-accent"): Indigo Thread label, underline on
 * hover, 2px focus ring. The single shared class string for inline links —
 * compose extras (layout, spacing) through className.
 */
export const accentLinkClasses =
  "text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type AccentLinkProps = ComponentProps<typeof Link>;

export function AccentLink({ className, ...props }: AccentLinkProps) {
  return <Link className={cn(accentLinkClasses, className)} {...props} />;
}
