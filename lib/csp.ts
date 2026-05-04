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
  ];

  return directives.join("; ");
}
