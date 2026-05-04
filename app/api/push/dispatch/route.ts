// Node route handler: cron-triggered push fan-out.
//
// Authentication: shared-secret bearer token (PUSH_DISPATCH_SECRET). The GH
// Actions workflow at .github/workflows/push-dispatch.yml is the only caller.
//
// The orchestration logic lives in `lib/push/run-dispatch.ts`. Route files
// in App Router can only export a fixed allow-list of names, so we keep
// the testable function out of this module.
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { defaultKv } from "@/lib/push/storage";
import { runDispatch } from "@/lib/push/run-dispatch";
import { sendPush } from "@/lib/push/sender";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  if (!authorize(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: noStoreJsonHeaders(),
    });
  }

  const summary = await runDispatch({
    kv: defaultKv(),
    now: new Date(),
    send: sendPush,
  });
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: noStoreJsonHeaders(),
  });
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 405 });
}

function authorize(request: NextRequest): boolean {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = header.slice(prefix.length);
  // Reject early on length mismatch so timingSafeEqual cannot throw.
  if (provided.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

function noStoreJsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}
