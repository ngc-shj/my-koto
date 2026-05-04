// Upstream host allowlist for Edge proxy (security boundary).
// Only hosts listed here may be fetched via the proxy.
// Keep this list minimal — adding a host requires the same hardening review as Step 7.
export const UPSTREAM_HOSTS = {
  weather: "api.open-meteo.com",
  // OpenStreetMap Overpass (read-only, ODbL data). Used for dynamic POI
  // lookup outside Koto-ku; bbox is server-clamped to the 23-wards envelope.
  overpass: "overpass-api.de",
  // 環境省 熱中症予防情報サイト. We hit the forecast CSV at a fixed station
  // code (44132 = Tokyo) — there is no user-controlled path component.
  wbgt: "www.wbgt.env.go.jp",
} as const;

export type UpstreamHostKey = keyof typeof UPSTREAM_HOSTS;
