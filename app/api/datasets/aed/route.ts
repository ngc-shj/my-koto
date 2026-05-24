import type { NextRequest } from "next/server";
import { readAed } from "@/lib/opendata/db/readers";
import { handleDatasetRoute } from "@/lib/opendata/datasets/route-handler";

// Node runtime: libsql file:// URL needs fs access (V8-isolate Edge
// runtime cannot read SQLite from disk). When DATASETS_DB_URL switches
// to libsql:// (Phase 4 / Turso), the same code runs unchanged.

export async function GET(request: NextRequest): Promise<Response> {
  return handleDatasetRoute(request, {
    key: "aed",
    read: readAed,
  });
}
