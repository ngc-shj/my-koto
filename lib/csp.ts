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
