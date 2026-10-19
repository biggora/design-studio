import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const COLUMN_LADDERS = {
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
} as const;

type CardGridProps = HTMLAttributes<HTMLElement> & {
  /** Wrapper element; index pages render `ul` with `li` cards. */
  as?: ElementType;
  /** Desktop column count: 3 for featured/index cards, 4 for value tiles, 5 (default) is the catalog ladder. */
  columns?: keyof typeof COLUMN_LADDERS;
};

/**
 * The shared card grid rhythm: 24px gaps over a responsive column ladder
 * (DESIGN.md). Denser variants (e.g. the compact `grid-cols-2 gap-3 sm:gap-6`
 * treatment) merge through `className` — tailwind-merge keeps the override.
 */
export function CardGrid({ as: Tag = "div", columns = 5, className, ...props }: CardGridProps) {
  return <Tag className={cn("grid gap-6", COLUMN_LADDERS[columns], className)} {...props} />;
}
