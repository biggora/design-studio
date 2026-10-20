"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { saveCookieConsent, useCookieConsent } from "@/lib/consent";

export function CookieBanner() {
  const consent = useCookieConsent();

  // Shown until the visitor makes an explicit choice; a stored decline keeps
  // it hidden just like an accept. Renders after hydration, when the stored
  // choice (if any) is known.
  if (consent !== "unset") return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      // Stable hook: overlays that share the bottom edge (mobile buy bar)
      // park above this banner while it is mounted.
      data-cookie-banner
      className="fixed bottom-0 left-0 right-0 z-50 bg-primary text-primary-foreground py-2.5 shadow-lg"
    >
      {/* Compact single row on sm+ so the home search stays above the fold;
        text and buttons stack tightly below sm. Same gutters as PageShell. */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="max-w-prose text-sm leading-snug">
          We use cookies to understand how visitors use this site. Analytics
          load only after you accept.{" "}
          <Link
            href="/privacy-policy"
            className="underline hover:text-primary-foreground/70"
          >
            Learn more
          </Link>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={() => saveCookieConsent("accepted")}>
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveCookieConsent("declined")}
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
