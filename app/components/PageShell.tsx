import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = HTMLAttributes<HTMLElement> & {
  /** Wrapper element; pages whose content is the page itself use "main". */
  as?: ElementType;
};

/**
 * Page content container: centered container with the DESIGN.md responsive
 * gutters (16px → 24px at sm → 32px at lg) and 32px vertical rhythm.
 */
export function PageShell({ as: Tag = "div", className, ...props }: PageShellProps) {
  return (
    <Tag
      className={cn("container mx-auto px-4 sm:px-6 lg:px-8 py-8", className)}
      {...props}
    />
  );
}
