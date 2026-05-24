import { PRODUCT_UA } from "./ua";

// SSRF-safe upstream GET shared by the Edge route handlers (wbgt /
// jma-quakes / jma-warnings / weather). `redirect: "manual"` and the
// AbortSignal timeout are non-negotiable invariants of the security
// posture and live here so a future caller cannot drop them by accident.
//
// Host allowlist validation stays at the call site — it varies per
// upstream and must remain visible in the route handler.
export function upstreamGet(
  url: URL,
  opts: { accept: string; timeoutMs?: number; ua?: string },
): Promise<Response> {
  const headers = new Headers({
    "User-Agent": opts.ua ?? PRODUCT_UA,
    Accept: opts.accept,
  });
  return fetch(url.toString(), {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
  });
}
