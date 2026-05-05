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
