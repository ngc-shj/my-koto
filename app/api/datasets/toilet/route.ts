import type { NextRequest } from "next/server";
import { readToilet } from "@/lib/opendata/db/readers";
import { handleDatasetRoute } from "@/lib/opendata/datasets/route-handler";

export async function GET(request: NextRequest): Promise<Response> {
  return handleDatasetRoute(request, {
    key: "toilet",
    read: readToilet,
  });
}
