// Upstream host allowlist for Edge proxy (security boundary).
// Only hosts listed here may be fetched via the proxy.
// WBGT is bundled as static data (data/wbgt.json) so it does not appear here.
// Keep this list minimal — adding a host requires the same hardening review as Step 7.
export const UPSTREAM_HOSTS = {
  weather: "api.open-meteo.com",
  // OpenStreetMap Overpass (read-only, ODbL data). Used for dynamic POI
  // lookup outside Koto-ku; bbox is server-clamped to the 23-wards envelope.
  overpass: "overpass-api.de",
} as const;

export type UpstreamHostKey = keyof typeof UPSTREAM_HOSTS;
