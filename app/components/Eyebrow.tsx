import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Small accent label above a display heading (DESIGN.md "Eyebrow" role):
 * uppercase, letter-spaced ember orange. Used sparingly — hero and section
 * openers only.
 */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.14em] text-accent",
        className,
      )}
      {...props}
    />
  );
}
