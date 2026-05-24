import type { NextRequest } from "next/server";
import { GomiResponseSchema } from "@/lib/opendata/schemas/gomi";
import { fetchGomiDatasetConditional } from "@/lib/opendata/datasets/gomi";
import { handleDatasetRoute } from "@/lib/opendata/datasets/edge-handler";

export const runtime = "edge";

export async function GET(request: NextRequest): Promise<Response> {
  return handleDatasetRoute(request, {
    key: "gomi",
    schema: GomiResponseSchema,
    load: fetchGomiDatasetConditional,
  });
}
