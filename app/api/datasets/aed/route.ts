import type { NextRequest } from "next/server";
import { AedResponseSchema } from "@/lib/opendata/schemas/aed";
import { fetchAedDatasetConditional } from "@/lib/opendata/datasets/aed";
import { handleDatasetRoute } from "@/lib/opendata/datasets/edge-handler";

export const runtime = "edge";

export async function GET(request: NextRequest): Promise<Response> {
  return handleDatasetRoute(request, {
    key: "aed",
    schema: AedResponseSchema,
    load: fetchAedDatasetConditional,
  });
}
