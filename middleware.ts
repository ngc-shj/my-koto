import { NextRequest, NextResponse } from "next/server";
import { buildCsp, buildReportingEndpoints, generateNonce } from "@/lib/csp/policy";

export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const env =
    process.env.NODE_ENV === "production" ? "production" : "development";

  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });

  const csp = buildCsp(env === "production" ? nonce : null, env);

  // Set CSP on the response so browsers enforce it.
  response.headers.set("Content-Security-Policy", csp);

  // Pair the `report-to` CSP directive with a Reporting-Endpoints header
  // pointing at our /api/csp-report sink. Production only — the dev CSP
  // omits the directive so dev breakage doesn't generate noise reports.
  if (env === "production") {
    response.headers.set("Reporting-Endpoints", buildReportingEndpoints());
  }

  // Pass nonce to Server Components via a forwarded request header.
  // app/layout.tsx reads x-nonce from headers() to inject it into <Script> tags.
  response.headers.set("x-nonce", nonce);

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static assets and _next internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
