import type { ReactNode } from "react";
import { cn, focusRingClasses, sanitizeUrl } from "@/lib/utils";

type IconLinkProps = {
  href: string;
  /** Accessible name, rendered visually hidden (DESIGN.md icon-link anatomy). */
  label: string;
  /** "field" on light surfaces, "band" on dark header/footer bars. */
  variant?: "field" | "band";
  className?: string;
  children: ReactNode;
};

const variantClasses = {
  field: "text-muted-foreground hover:text-accent",
  band: "text-primary-foreground/70 hover:text-primary-foreground",
} as const;

/**
 * 24px glyph link for social and share icons (DESIGN.md "icon-link"): muted at
 * rest, accent on hover, sr-only label, color-only hover. The href is
 * sanitized to http(s); the link always opens in a new tab.
 */
export function IconLink({ href, label, variant = "field", className, children }: IconLinkProps) {
  return (
    <a
      href={sanitizeUrl(href)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "rounded-sm transition-colors",
        variantClasses[variant],
        focusRingClasses,
        className,
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </a>
  );
}
