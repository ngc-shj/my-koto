import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const isDev = process.env.NODE_ENV === "development";

// CSP is split by environment:
// - dev: allows unsafe-inline and unsafe-eval for Next.js hot reload
// - prod: uses nonce + strict-dynamic, no unsafe-eval
const cspScriptSrc = isDev
  ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
  : `script-src 'self' 'strict-dynamic'`;

const contentSecurityPolicy = [
  `default-src 'self'`,
  cspScriptSrc,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: https://cyberjapandata.gsi.go.jp`,
  `connect-src 'self' https://api.open-meteo.com https://cyberjapandata.gsi.go.jp`,
  `font-src 'self' data:`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  ...(isDev ? [] : [`upgrade-insecure-requests`]),
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-site",
  },
  {
    key: "Permissions-Policy",
    value: [
      "geolocation=(self)",
      "camera=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "clipboard-write=(self)",
      "clipboard-read=()",
      "bluetooth=()",
      "accelerometer=()",
      "gyroscope=()",
      "magnetometer=()",
      "interest-cohort=()",
      "browsing-topics=()",
    ].join(", "),
  },
];

const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

const withPWA = withPWAInit({
  // Disable SW in development to preserve hot-reload behavior
  disable: isDev,
  dest: "public",
  // Auto-register SW on page load
  register: true,
  // Serve /offline as the navigation fallback when network is unavailable
  fallbacks: { document: "/offline" },
  workboxOptions: {
    // Take control of all open clients immediately after installation
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      // Static pages: NetworkFirst with 3-second timeout then cache fallback
      {
        urlPattern: /^https?:\/\/[^/]+\/(|about|privacy|disclaimer|gomi|gomi\/search|map|events|weather|settings)$/,
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
      // /api/weather and /api/ics/*: do NOT cache via SW (Edge cache / client refetch handles these)
      {
        urlPattern: /\/api\/(weather|ics\/.*)/,
        handler: "NetworkOnly",
      },
    ],
  },
});

const baseConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withPWA(baseConfig);
