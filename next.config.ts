import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { swRuntimeCaching } from "./lib/sw-runtime-caching";

const isDev = process.env.NODE_ENV === "development";

// CSP is now generated dynamically in middleware.ts with per-request nonce injection.
// Only static security headers that do not require dynamic values are set here.
const securityHeaders = [
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
    runtimeCaching: swRuntimeCaching(buildId),
  },
});

const baseConfig: NextConfig = {
  // Configured via NEXT_PUBLIC_BASE_PATH so dev keeps serving at /. The
  // Tailscale Funnel deployment sets it to "/my-koto"; lib/site/base-path.ts
  // mirrors the same env var for non-Next surfaces (raw <a> / fetch).
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
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
