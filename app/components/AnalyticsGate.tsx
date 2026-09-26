"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { useCookieConsent } from "@/lib/consent";

/**
 * Mounts Google Analytics only after the visitor accepted cookies — nothing
 * loads before the choice (or after a decline), and accepting turns it on
 * without a reload.
 */
export function AnalyticsGate({ gaId }: { gaId: string }) {
  const consent = useCookieConsent();
  if (consent !== "accepted") return null;
  return <GoogleAnalytics gaId={gaId} />;
}
