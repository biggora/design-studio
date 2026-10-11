"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { useCookieConsent } from "@/lib/consent";

/**
 * Mounts Google Analytics only on the configured site after cookie consent.
 * Local and preview copies sharing the database must not send production events.
 */
export function AnalyticsGate({ gaId, domain }: { gaId: string; domain: string }) {
  const consent = useCookieConsent();
  if (consent !== "accepted" || typeof window === "undefined") return null;
  const siteHostname = new URL(`https://${domain}`).hostname.replace(/^www\./, "");
  if (window.location.hostname.replace(/^www\./, "") !== siteHostname) return null;
  return <GoogleAnalytics gaId={gaId} />;
}
