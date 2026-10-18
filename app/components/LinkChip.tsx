import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type LinkChipProps = ComponentProps<typeof Link> & {
  /** Marks the chip whose collection page is currently shown. */
  selected?: boolean;
};

/**
 * Interest chip linking into the catalog (home interest navs, CollectionLinks).
 * min-h-11 keeps the 44px touch target on mobile.
 */
export function LinkChip({ className, selected, ...props }: LinkChipProps) {
  return (
    <Link
      aria-current={selected ? "page" : undefined}
      className={cn(
        "inline-flex items-center min-h-11 border border-input rounded-md px-3 py-2 text-sm text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
