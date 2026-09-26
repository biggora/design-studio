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
      className="fixed bottom-0 left-0 right-0 z-50 bg-primary text-primary-foreground p-4 shadow-lg"
    >
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm">
          We use cookies to understand how visitors use this site. Analytics
          load only after you accept.{" "}
          <Link
            href="/privacy-policy"
            className="underline hover:text-primary-foreground/70"
          >
            Learn more
          </Link>
        </p>
        <div className="flex items-center gap-3 shrink-0">
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
