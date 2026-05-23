// Persists the visitor's geolocation consent choice (granted/denied)
// across visits so the modal stops re-asking. The coordinates
// themselves are still never stored — only the boolean preference.
//
// SSR-safe: every accessor early-returns when `window` is undefined.

import { isBrowser } from "@/lib/ssr";

const STORAGE_KEY = "geolocation_consent_v1";

export type GeolocationConsentChoice = "granted" | "denied";

export function loadGeolocationConsent(): GeolocationConsentChoice | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "granted" || raw === "denied" ? raw : null;
}

export function saveGeolocationConsent(
  choice: GeolocationConsentChoice,
): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Quota / privacy mode — fall back to the modal re-asking next time.
  }
}

export function clearGeolocationConsent(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same fallback as save.
  }
}
