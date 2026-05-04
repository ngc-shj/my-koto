import { notFound } from "next/navigation";
import { isValidDistrictId } from "@/config/districts";
import districtsData from "@/data/districts.json";
import overlaysData from "@/data/gomi-schedule.json";
import { DistrictSchema, SpecialOverlaySchema } from "@/lib/gomi/types";
import { resolveSchedule } from "@/lib/gomi/schedule";
import { buildGomiIcs } from "@/lib/ics";

// Resolve schedule for the next 90 days from today.
const SCHEDULE_DAYS = 90;

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

  // Find the district master record and validate.
  const districtRecord = districtsData.find(
    (d: { id: string }) => d.id === district,
  );
  if (!districtRecord) {
    notFound();
  }
  const parsedDistrict = DistrictSchema.parse(districtRecord);

  // Parse special overlays.
  const overlays = overlaysData.map((o) => SpecialOverlaySchema.parse(o));

  // Resolve schedule for the next 90 days.
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from);
  to.setDate(to.getDate() + SCHEDULE_DAYS);

  const occurrences = resolveSchedule(parsedDistrict, overlays, { from, to });

  const ics = buildGomiIcs(parsedDistrict, occurrences);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="koto-gomi-${district}.ics"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
