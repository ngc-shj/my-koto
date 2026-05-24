// Configured at build time via NEXT_PUBLIC_BASE_PATH. Empty in dev so
// `npm run dev` keeps serving at /. When the env var is set (e.g.
// "/my-koto" for the Tailscale Funnel mount), next.config.ts also
// applies it so <Link>, <Image>, and API route registration get the
// prefix automatically — this helper exists for the remaining surface
// (plain <a href> and raw fetch strings) that Next.js does not touch.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Prefix an app-relative absolute path with the configured basePath.
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
