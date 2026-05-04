import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
