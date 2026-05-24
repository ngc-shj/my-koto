import type { NextRequest } from "next/server";
import { readGomi } from "@/lib/opendata/db/readers";
import { handleDatasetRoute } from "@/lib/opendata/datasets/route-handler";

export async function GET(request: NextRequest): Promise<Response> {
  return handleDatasetRoute(request, {
    key: "gomi",
    read: readGomi,
  });
}
