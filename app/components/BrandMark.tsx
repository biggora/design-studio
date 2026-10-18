"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  /** The configured `siteLogo` asset (absolute path or https URL). */
  siteLogo?: string;
  /** Brand name — the monogram fallback source and the img context. */
  name: string;
  className?: string;
};

/**
 * Brand mark shared by the header and footer: renders the configured
 * `siteLogo` asset inside the standard tile, falling back to a monogram tile
 * derived from the name when no logo is configured or the asset fails to
 * load. The asset lives entirely in configuration — never a hardcoded brand.
 */
export function BrandMark({ siteLogo, name, className }: BrandMarkProps) {
  const [failed, setFailed] = useState(false);
  const src = typeof siteLogo === "string" ? siteLogo.trim() : "";
  const usable = src.startsWith("/") || /^https:\/\//i.test(src);
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  if (usable && !failed) {
    return (
      // Operator-configured, trusted asset; next/image would block SVGs
      // without dangerouslyAllowSVG, so a plain img keeps the config contract.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={cn("h-8 w-8 shrink-0 rounded-lg object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-base font-bold text-accent-foreground",
        className,
      )}
    >
      {initial}
    </span>
  );
}
