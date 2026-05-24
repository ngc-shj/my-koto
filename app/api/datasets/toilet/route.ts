import type { NextRequest } from "next/server";
import { ToiletResponseSchema } from "@/lib/opendata/schemas/toilet";
import { fetchToiletDataset } from "@/lib/opendata/datasets/toilet";
import { handleDatasetRoute } from "@/lib/opendata/datasets/edge-handler";

export const runtime = "edge";

export async function GET(request: NextRequest): Promise<Response> {
  return handleDatasetRoute(request, {
    key: "toilet",
    schema: ToiletResponseSchema,
    load: fetchToiletDataset,
  });
}
