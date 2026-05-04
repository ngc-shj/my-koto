import { NextRequest, NextResponse } from "next/server";
import { generateNonce } from "@/lib/csp";

export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const response = NextResponse.next();

  // Pass nonce to Server Components via request header for CSP nonce injection.
  // Full nonce-based CSP wiring in script-src is completed in Step 9.
  response.headers.set("x-nonce", nonce);

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static assets and _next internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
