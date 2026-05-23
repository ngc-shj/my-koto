// Centralised cache TTL constants for Track A layered caching.
// All values in seconds unless suffixed with _MS.
export const WEATHER_CACHE = {
  BROWSER_MAX_AGE: 300,           // 5 min
  SHARED_MAX_AGE: 3600,           // 1 h
  STALE_WHILE_REVALIDATE: 600,    // 10 min
  STALE_IF_ERROR: 86400,          // 24 h
  CLIENT_TTL_MS: 5 * 60_000,      // == BROWSER_MAX_AGE * 1000
} as const;

export const POIS_CACHE = {
  BROWSER_MAX_AGE: 3600,
  SHARED_MAX_AGE: 3600,
  STALE_WHILE_REVALIDATE: 86400,
  STALE_IF_ERROR: 86400,
} as const;

// JMA warning/advisory feed updates often during severe weather, so the
// cache is intentionally short. STALE_IF_ERROR keeps a stale value visible
// for an hour if the upstream goes down — better than blanking the panel.
export const JMA_WARNING_CACHE = {
  BROWSER_MAX_AGE: 60,
  SHARED_MAX_AGE: 60,
  STALE_WHILE_REVALIDATE: 60,
  STALE_IF_ERROR: 3600,
  CLIENT_TTL_MS: 60_000,
} as const;

// Quake list grows only when a felt earthquake occurs, so a longer TTL is
// appropriate. Stale-if-error is one day because the page must keep
// showing the most recent known event even if the upstream is briefly
// unreachable.
export const JMA_QUAKE_CACHE = {
  BROWSER_MAX_AGE: 300,
  SHARED_MAX_AGE: 300,
  STALE_WHILE_REVALIDATE: 600,
  STALE_IF_ERROR: 86400,
  CLIENT_TTL_MS: 5 * 60_000,
} as const;

// Bus GTFS bundle is large (~12 MB) and only refreshes when an admin
// re-runs the fetch script. Long CDN/browser caches paired with a 7-day
// IndexedDB cache on the client keep the payload off the critical path
// for repeat visitors.
export const MAP_BUS_CACHE = {
  BROWSER_MAX_AGE: 86400,         // 1 day
  SHARED_MAX_AGE: 604800,         // 7 days
  STALE_WHILE_REVALIDATE: 604800, // 7 days
  STALE_IF_ERROR: 2592000,        // 30 days
  CLIENT_TTL_MS: 7 * 24 * 60 * 60_000,
} as const;
