import type { NextRequest } from "next/server";
import { EventResponseSchema } from "@/lib/opendata/schemas/events";
import { fetchEventsDataset } from "@/lib/opendata/datasets/events";
import { handleDatasetRoute } from "@/lib/opendata/datasets/edge-handler";

export const runtime = "edge";

export async function GET(request: NextRequest): Promise<Response> {
  return handleDatasetRoute(request, {
    key: "events",
    schema: EventResponseSchema,
    load: fetchEventsDataset,
  });
}
