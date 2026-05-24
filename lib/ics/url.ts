import { BASE_PATH } from "@/lib/site/base-path";

// iOS uses the webcal:// scheme to directly open the Calendar app when
// subscribing. Other platforms open a browser-based subscribe flow that
// expects an http(s):// URL — and that URL must use the same scheme as
// the page itself, otherwise dev sessions on http://localhost render an
// https:// link that the browser cannot reach (404-looking error).
const IOS_UA_PATTERN = /iPhone|iPad|iPod/i;

// Returns the scheme prefix (without `:`) the calendar link should use.
// Exported so the events helper and any future tests can share the rule.
export function pickSubscriptionScheme(
  userAgent: string,
  pageProtocol: string,
): "webcal" | "http" | "https" {
  if (IOS_UA_PATTERN.test(userAgent)) return "webcal";
  // pageProtocol arrives like "http:" / "https:" — strip the colon and
  // fall back to https when something unexpected (file:, blob:, …) shows up.
  const normalised = pageProtocol.replace(/:$/, "");
  return normalised === "http" ? "http" : "https";
}

/**
 * Build a calendar subscription URL for the given district.
 *
 * Returns `webcal://` on iOS so that tapping the link opens the Calendar app
 * directly. On other platforms returns the same scheme as the current page,
 * so a development session served over http://localhost stays on http and
 * production over https:// stays on https.
 *
 * @param district - Validated district id (e.g. "kameido-1-3").
 * @param host - Hostname (with port) without scheme (e.g. "koto.example.com").
 * @param userAgent - UA string from the request headers (or navigator.userAgent).
 * @param pageProtocol - `window.location.protocol` from the calling page.
 */
export function gomiSubscriptionUrl(
  district: string,
  host: string,
  userAgent: string,
  pageProtocol: string = "https:",
): string {
  const path = `${BASE_PATH}/api/ics/gomi/${district}`;
  const scheme = pickSubscriptionScheme(userAgent, pageProtocol);
  return `${scheme}://${host}${path}`;
}

/**
 * Build the events calendar subscription URL.
 *
 * Same scheme-selection rules as `gomiSubscriptionUrl`.
 *
 * @param host - Hostname (with port) without scheme.
 * @param userAgent - UA string from the request headers (or navigator.userAgent).
 * @param pageProtocol - `window.location.protocol` from the calling page.
 */
export function eventsSubscriptionUrl(
  host: string,
  userAgent: string,
  pageProtocol: string = "https:",
): string {
  const path = `${BASE_PATH}/api/ics/events`;
  const scheme = pickSubscriptionScheme(userAgent, pageProtocol);
  return `${scheme}://${host}${path}`;
}
