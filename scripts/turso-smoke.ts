#!/usr/bin/env node
/**
 * Cutover sanity check for the Turso libsql database. Run this before
 * pointing Vercel production at a new DATASETS_DB_URL to confirm the
 * URL + auth token actually let the app open the snapshot.
 *
 * Usage:
 *   DATASETS_DB_URL="libsql://<db>-<org>.turso.io" \
 *   DATASETS_DB_AUTH_TOKEN="<token>" \
 *     npx tsx scripts/turso-smoke.ts
 *
 * What it checks:
 *   1. createClient + ensureSchema succeed (URL reachable, token accepted).
 *   2. _meta has a freshness row for every dataset the Cron is meant to
 *      maintain. A missing row means the Cron has never written to this
 *      database — usually a sign the GitHub secret points elsewhere.
 *   3. Each dataset table has at least one row. An empty table after a
 *      successful Cron run means the upstream returned no records, which
 *      is suspicious enough to surface here rather than swallow.
 *
 * Exits non-zero on any failure so it can be wired into a manual deploy
 * checklist or future pre-deploy CI hook.
 */

import { openDatasetsDb, ensureSchema } from "@/lib/opendata/db/client";
import { readMetaVersion } from "@/lib/opendata/db/readers";

const EXPECTED_SOURCES = ["aed", "toilet", "events", "gomi", "bus"] as const;
const TABLE_OF: Record<(typeof EXPECTED_SOURCES)[number], string> = {
  aed: "aed",
  toilet: "toilet",
  events: "events",
  gomi: "gomi",
  bus: "bus",
};

async function main(): Promise<void> {
  const url = process.env["DATASETS_DB_URL"];
  if (!url) {
    console.error(
      "DATASETS_DB_URL is required. Set it to the libsql:// URL you intend to put on Vercel.",
    );
    process.exit(2);
  }
  // Mask the host when echoing back so a copy-pasted log doesn't leak
  // the full identifier.
  console.log(`[turso-smoke] target: ${maskUrl(url)}`);

  const db = openDatasetsDb();
  await ensureSchema(db);
  console.log("[turso-smoke] schema OK");

  let failed = 0;
  for (const source of EXPECTED_SOURCES) {
    const version = await readMetaVersion(db, source);
    const table = TABLE_OF[source];
    const count = await rowCount(db, table);
    if (!version) {
      console.error(
        `  - ${source}: MISSING _meta row (Cron has never written here?)`,
      );
      failed++;
    } else if (count === 0) {
      console.error(
        `  - ${source}: 0 rows in ${table} (version=${version}); upstream returned empty?`,
      );
      failed++;
    } else {
      console.log(
        `  - ${source}: ${count} rows, version=${version}`,
      );
    }
  }

  if (failed > 0) {
    console.error(`[turso-smoke] ${failed} dataset(s) failed — not safe to cut over yet.`);
    process.exit(1);
  }
  console.log("[turso-smoke] all datasets healthy — safe to switch Vercel DATASETS_DB_URL.");
}

async function rowCount(
  db: ReturnType<typeof openDatasetsDb>,
  table: string,
): Promise<number> {
  const res = await db.execute(`SELECT COUNT(*) AS n FROM ${table}`);
  const row = res.rows[0];
  const v = row?.["n"];
  return typeof v === "number" ? v : Number(v ?? 0);
}

function maskUrl(url: string): string {
  // libsql://<db>-<org>.turso.io → libsql://<db>-***.turso.io
  return url.replace(/(-[^.]+\.turso\.io)/, "-***.turso.io");
}

main().catch((err) => {
  console.error(`[turso-smoke] error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
