import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SectionHeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  /** H2 voice (DESIGN.md): "title" (default) for catalog sections, "headline" for the home band openers. */
  variant?: "title" | "headline";
};

/** Section H2. "title" is the Title voice (1.5rem/600, 16px clearance); "headline" is the band opener voice (700, 1.875→2.25rem) with spacing owned by its wrapper. */
export function SectionHeading({ variant = "title", className, ...props }: SectionHeadingProps) {
  return (
    <h2
      className={cn(
        "font-display text-foreground",
        variant === "headline"
          ? "text-3xl font-bold tracking-[-0.02em] sm:text-4xl"
          : "text-2xl font-semibold mb-4",
        className,
      )}
      {...props}
    />
  );
}
