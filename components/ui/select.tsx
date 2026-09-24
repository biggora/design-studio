import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Styled native <select>. Radix-based shadcn Select was deliberately not
 * used: this project ships no Radix dependency, and the native control
 * keeps the collection filter keyboard- and screen-reader-accessible
 * for free.
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    className={cn(
      "flex w-full rounded-md border border-input bg-card px-4 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    ref={ref}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export { Select };
