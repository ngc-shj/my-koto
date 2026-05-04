// iOS uses the webcal:// scheme to directly open the Calendar app when subscribing.
// Other platforms (Android, macOS, Windows) open a browser-based subscribe flow with https://.
const IOS_UA_PATTERN = /iPhone|iPad|iPod/i;

/**
 * Build a calendar subscription URL for the given district.
 *
 * Returns `webcal://` on iOS so that tapping the link opens the Calendar app directly.
 * Returns `https://` on all other platforms.
 *
 * @param district - Validated district id (e.g. "kameido-1").
 * @param host - Hostname without scheme (e.g. "koto.example.com").
 * @param userAgent - UA string from the request headers (or navigator.userAgent).
 */
export function gomiSubscriptionUrl(
  district: string,
  host: string,
  userAgent: string,
): string {
  const path = `/api/ics/gomi/${district}/route.ics`;
  const scheme = IOS_UA_PATTERN.test(userAgent) ? "webcal" : "https";
  return `${scheme}://${host}${path}`;
}

/**
 * Build the events calendar subscription URL.
 *
 * Returns `webcal://` on iOS so that tapping the link opens the Calendar app directly.
 * Returns `https://` on all other platforms.
 *
 * @param host - Hostname without scheme (e.g. "koto.example.com").
 * @param userAgent - UA string from the request headers (or navigator.userAgent).
 */
export function eventsSubscriptionUrl(host: string, userAgent: string): string {
  const path = "/api/ics/events";
  const scheme = IOS_UA_PATTERN.test(userAgent) ? "webcal" : "https";
  return `${scheme}://${host}${path}`;
}
