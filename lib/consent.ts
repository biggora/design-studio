import { useSyncExternalStore } from "react";

/**
 * Cookie-consent contract shared by the banner (writer) and the analytics
 * gate (reader). The stored value is the string "true" or "false"; absent
 * means the visitor has not chosen yet.
 */
export const COOKIE_CONSENT_STORAGE_KEY = "cookiesAccepted";
export const COOKIE_CONSENT_EVENT = "cookie-consent-changed";

export type CookieConsent = "accepted" | "declined" | "unset";

export function saveCookieConsent(consent: "accepted" | "declined"): void {
  const value = consent === "accepted" ? "true" : "false";
  try {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, value);
  } catch {}
  window.dispatchEvent(
    new CustomEvent(COOKIE_CONSENT_EVENT, { detail: value }),
  );
}

/** Client-side only: touches localStorage. Passed as useSyncExternalStore's snapshot getter. */
function getSnapshot(): CookieConsent {
  try {
    const value = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (value === "true") return "accepted";
    if (value === "false") return "declined";
  } catch {}
  return "unset";
}

function subscribe(onChange: () => void): () => void {
  // "storage" keeps other tabs of the same site in sync with the choice.
  const listener = () => onChange();
  window.addEventListener(COOKIE_CONSENT_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(COOKIE_CONSENT_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * The visitor's current consent. Renders with "unset" on the server and
 * re-reads the stored choice after hydration, so neither the banner nor the
 * analytics gate can hydrate into a mismatch.
 */
export function useCookieConsent(): CookieConsent {
  return useSyncExternalStore(subscribe, getSnapshot, () => "unset");
}
