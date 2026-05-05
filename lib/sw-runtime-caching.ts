import type { RuntimeCaching } from "workbox-build";

export function swRuntimeCaching(buildId: string): RuntimeCaching[] {
  return [
    // Static pages: NetworkFirst with 3-second timeout then cache fallback
    {
      urlPattern:
        /^https?:\/\/[^/]+\/(|about|privacy|disclaimer|gomi|gomi\/search|map|events|weather|settings)$/,
      handler: "NetworkFirst",
      options: {
        cacheName: `pages-${buildId}`,
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    // Static assets (_next/static): CacheFirst for long-lived immutable files
    {
      urlPattern: /\/_next\/static\/.*/,
      handler: "CacheFirst",
      options: {
        cacheName: `static-${buildId}`,
        expiration: { maxEntries: 256, maxAgeSeconds: 365 * 24 * 60 * 60 },
      },
    },
    // Images and icons: CacheFirst
    {
      urlPattern: /\.(png|svg|ico|webp|jpg|jpeg)$/,
      handler: "CacheFirst",
      options: {
        cacheName: `images-${buildId}`,
        expiration: { maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    // /api/weather: StaleWhileRevalidate so offline/slow-network sessions get instant render
    {
      urlPattern: /^https?:\/\/[^/]+\/api\/weather(?:\?[^#]*)?$/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: `weather-${buildId}`,
        expiration: { maxEntries: 4, maxAgeSeconds: 3600 },
      },
    },
    // /api/ics/*: NetworkOnly — file downloads must never be SW-cached
    {
      urlPattern: /^https?:\/\/[^/]+\/api\/ics\/[^?#]+/,
      handler: "NetworkOnly",
    },
  ];
}
