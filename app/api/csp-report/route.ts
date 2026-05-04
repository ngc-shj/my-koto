// Edge route handler: receive CSP violation reports.
//
// Browsers (Reporting API v1: Chrome / Edge / partial Firefox via report-uri)
// POST one or more violation reports to this URL when the page violates the
// production CSP. We sanitise each report — strip query strings, truncate
// long fields, classify the user agent down to a browser family — and push
// the result onto a capped FIFO LIST so /status can render the latest.
//
// We never echo the raw report back; the response is always 204 to avoid
// leaking storage state to the caller.
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  appendReport,
  defaultCspReportKv,
  RawReportSchema,
  sanitise,
} from "@/lib/csp/reports";
import { rateLimitResponse, getAllowedOrigin } from "@/lib/api-shared";

export const runtime = "edge";

const ReportArraySchema = z.array(RawReportSchema);

function noStoreHeaders(): Headers {
  const h = new Headers();
  h.set("Cache-Control", "no-store");
  h.set("Access-Control-Allow-Origin", getAllowedOrigin());
  return h;
}

export async function POST(request: NextRequest): Promise<Response> {
  const headers = noStoreHeaders();

  // Generous-but-bounded rate limit. CSP reports are infrequent in normal
  // operation but can flood when a misconfigured CSP catches every page,
  // so we cap per-IP at 30/min.
  const tooMany = await rateLimitResponse(
    request,
    { bucket: "csp-report", limit: 30, windowSec: 60 },
    headers,
  );
  if (tooMany) return tooMany;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400, headers });
  }

  // Reporting API delivers an array; legacy report-uri delivers
  // `{ "csp-report": {...} }` — try both shapes.
  let raws: unknown[] = [];
  if (Array.isArray(body)) {
    raws = body;
  } else if (body && typeof body === "object" && "csp-report" in body) {
    // Legacy single-report envelope. Wrap into the report-array shape so
    // sanitise() can run uniformly downstream.
    const inner = (body as { "csp-report": unknown })["csp-report"];
    if (inner && typeof inner === "object") {
      raws = [{ type: "csp-violation", body: inner }];
    }
  }

  // Cap how many reports we will accept per request so a malformed batch
  // can't blow up KV in one POST. Anything beyond the cap is silently
  // dropped — clients don't need to know.
  const MAX_REPORTS_PER_REQUEST = 10;
  const trimmed = raws.slice(0, MAX_REPORTS_PER_REQUEST);

  const parsed = ReportArraySchema.safeParse(trimmed);
  if (!parsed.success) {
    return new Response(null, { status: 204, headers });
  }

  const kv = defaultCspReportKv();
  const now = Date.now();
  for (const raw of parsed.data) {
    const sanitised = sanitise(raw, now);
    if (sanitised == null) continue;
    try {
      await appendReport(kv, sanitised);
    } catch {
      // Storage failure is non-fatal — the browser can't act on a 5xx
      // anyway, and the next report will retry the write.
    }
  }

  // 204 No Content is the canonical success status for the Reporting API.
  return new Response(null, { status: 204, headers });
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 405 });
}
export async function PUT(): Promise<Response> {
  return new Response(null, { status: 405 });
}
export async function DELETE(): Promise<Response> {
  return new Response(null, { status: 405 });
}
