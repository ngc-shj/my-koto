import { BASE_PATH } from "@/lib/site/base-path";

/**
 * Generates a cryptographically secure nonce for use in Content-Security-Policy headers.
 * Uses CSPRNG (crypto.getRandomValues) to produce 128-bit entropy.
 * Weak PRNGs such as the built-in Math object's random method are intentionally avoided.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Base64URL encoding: URL-safe variant without padding
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Builds a Content-Security-Policy header value.
 *
 * Production: nonce-based script-src with strict-dynamic; no unsafe-inline or unsafe-eval.
 * Development: unsafe-inline + unsafe-eval allowed for Next.js hot-reload.
 */
export function buildCsp(
  nonce: string | null,
  env: "development" | "production",
): string {
  const isDev = env === "development";

  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
    : nonce
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'strict-dynamic'`;

  const directives = [
    `default-src 'self'`,
    scriptSrc,
    // S-06 — defense-in-depth note:
    // Tailwind v4's runtime emits inline <style> blocks for utility classes,
    // so 'unsafe-inline' on style-src is required for correct rendering.
    // script-src is nonce/strict-dynamic, so XSS via injected <script> is
    // already blocked; the residual risk is CSS-injection style exfil
    // (visited-link selectors), which has no concrete attack vector against
    // a static informational site. Revisit when Tailwind exposes a nonce
    // pipeline or when we move user-generated content into the app.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https://cyberjapandata.gsi.go.jp`,
    `connect-src 'self' https://api.open-meteo.com https://cyberjapandata.gsi.go.jp`,
    `font-src 'self' data:`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // Browsers that support the Reporting API (Chrome / Edge) post
    // violations to the named endpoint group, which middleware emits via
    // the Reporting-Endpoints header. The legacy report-uri keeps Firefox
    // working too — its support of report-to is still rolling out.
    ...(isDev
      ? []
      : [
          `upgrade-insecure-requests`,
          `report-uri ${CSP_REPORT_PATH}`,
          `report-to ${CSP_REPORT_GROUP}`,
        ]),
  ];

  return directives.join("; ");
}

// Endpoint group identifier paired with the Reporting-Endpoints header in
// middleware.ts. Centralised so the CSP directive and the header can never
// drift apart.
export const CSP_REPORT_GROUP = "csp-endpoint";
// Prefixed with BASE_PATH so the browser's report-uri/report-to lookup hits
// the actual route under the Tailscale Funnel mount.
export const CSP_REPORT_PATH = `${BASE_PATH}/api/csp-report`;

// Builds the value for the Reporting-Endpoints response header. Browsers
// (Chrome 96+, Edge 96+) read this to learn where to POST CSP violation
// reports referenced by the `report-to <group>` directive above.
export function buildReportingEndpoints(): string {
  return `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`;
}
