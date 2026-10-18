import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Section H2 (DESIGN.md "Title" role). */
export function SectionHeading({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-2xl font-semibold mb-4 text-foreground", className)} {...props} />;
}
