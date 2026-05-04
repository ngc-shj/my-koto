import { notFound } from "next/navigation";
import { isValidDistrictId } from "@/config/districts";

// ICS generation is deferred to Step 6 (ical-generator + VTIMEZONE).
// This route only implements the two-stage district validation.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ district: string }> },
): Promise<Response> {
  const { district } = await params;

  // Stage 1: character-class restriction — ASCII slug only.
  // Blocks Unicode lookalikes, double-encoded paths, and directory traversal.
  if (!/^[a-z0-9-]{1,32}$/.test(district)) {
    notFound();
  }

  // Stage 2: case-sensitive allowlist check.
  if (!isValidDistrictId(district)) {
    notFound();
  }

  // TODO(Step 6): generate VCALENDAR with ical-generator + VTIMEZONE.
  return new Response("Not implemented (ical-generator pending Step 6)", {
    status: 501,
  });
}
