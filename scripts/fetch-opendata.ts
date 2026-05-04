/**
 * Fetches open data from Tokyo Open Data API and saves to data/*.json.
 * Run via: npx tsx scripts/fetch-opendata.ts
 *
 * On schema validation failure:
 *   - Existing data/*.json is NOT overwritten.
 *   - Discord webhook is called (if DISCORD_WEBHOOK is set).
 *   - Process exits with code 1.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DATASETS, TOKYO_OPEN_DATA_API_BASE, WBGT_BASE_URL, WBGT_STATION_CODE } from "@/config/opendata";
import { AedResponseSchema } from "@/lib/opendata/schemas/aed";
import { ToiletResponseSchema } from "@/lib/opendata/schemas/toilet";
import { GomiResponseSchema } from "@/lib/opendata/schemas/gomi";
import { EventResponseSchema } from "@/lib/opendata/schemas/events";
import { WbgtDataSchema } from "@/lib/opendata/schemas/wbgt";

const DATA_DIR = join(process.cwd(), "data");
const USER_AGENT =
  process.env["UA_OVERRIDE"] ??
  "koto-city-bot/1.0 (+https://example.com/about)";

// Sends a Discord notification if DISCORD_WEBHOOK env var is set.
// Exported to allow injection in tests.
export async function notifyDiscord(message: string): Promise<void> {
  const webhookUrl = process.env["DISCORD_WEBHOOK"];
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validates data against a Zod schema, then persists to outputPath.
 * If validation fails, the existing file is NOT overwritten and the
 * provided discord notifier is called with an error message.
 *
 * Returns { ok: false } without throwing so callers can collect all errors.
 */
export async function validateAndPersist<T>(
  data: unknown,
  schema: z.ZodType<T>,
  outputPath: string,
  discordNotifier: (msg: string) => Promise<void> = notifyDiscord
): Promise<ValidationResult> {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errorSummary = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");

    const message = `[koto-city] Schema validation failed for ${outputPath}: ${errorSummary}`;
    console.error(message);
    await discordNotifier(message);

    return { ok: false, reason: errorSummary };
  }

  writeFileSync(outputPath, JSON.stringify(result.data, null, 2) + "\n", "utf-8");
  console.log(`Saved: ${outputPath}`);
  return { ok: true };
}

// Exported (T-03) so route guards (Content-Type allowlist, redirect:'manual',
// AbortSignal timeout) can be unit-tested with a mocked fetch.
export async function fetchJson(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
    throw new Error(`Unexpected Content-Type: ${contentType}`);
  }

  return res.json();
}

// Exported pure parser for the WBGT CSV (T-03). Input is the full body.
// Drops the header row, ignores blank lines, and rejects rows missing a
// datetime or whose WBGT value is not a finite number.
export function parseWbgtCsv(
  csv: string,
  station = "東京",
): Array<{ station: string; datetime: string; wbgt: number }> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  return lines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.split(",");
      const datetime = parts[0]?.trim() ?? "";
      const wbgt = parseFloat(parts[1]?.trim() ?? "");
      if (!datetime || !Number.isFinite(wbgt)) return null;
      return { station, datetime, wbgt };
    })
    .filter((r): r is { station: string; datetime: string; wbgt: number } =>
      r !== null,
    );
}

function buildApiUrl(datasetId: string): string {
  return `${TOKYO_OPEN_DATA_API_BASE}/v1/dataset/${datasetId}`;
}

async function fetchAed(): Promise<void> {
  const data = await fetchJson(buildApiUrl(DATASETS.aed));
  await validateAndPersist(data, AedResponseSchema, join(DATA_DIR, "aed.json"));
}

async function fetchToilet(): Promise<void> {
  const data = await fetchJson(buildApiUrl(DATASETS.toilet));
  await validateAndPersist(data, ToiletResponseSchema, join(DATA_DIR, "toilet.json"));
}

async function fetchGomi(): Promise<void> {
  const data = await fetchJson(buildApiUrl(DATASETS.gomi));
  await validateAndPersist(data, GomiResponseSchema, join(DATA_DIR, "gomi.json"));
}

async function fetchEvents(): Promise<void> {
  const data = await fetchJson(buildApiUrl(DATASETS.events));
  await validateAndPersist(data, EventResponseSchema, join(DATA_DIR, "events.json"));
}

async function fetchWbgt(): Promise<void> {
  // Ministry of Environment WBGT CSV download for Tokyo observation point.
  const url = `${WBGT_BASE_URL}/wbgt_data.php?pd=today&obs=${WBGT_STATION_CODE}&format=csv`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`WBGT fetch failed: HTTP ${res.status}`);
  }

  const csv = await res.text();
  const readings = parseWbgtCsv(csv);

  const wbgtData = {
    fetchedAt: new Date().toISOString(),
    readings,
  };

  await validateAndPersist(wbgtData, WbgtDataSchema, join(DATA_DIR, "wbgt.json"));
}

async function main(): Promise<void> {
  const tasks: Array<{ name: string; fn: () => Promise<void> }> = [
    { name: "AED", fn: fetchAed },
    { name: "Toilet", fn: fetchToilet },
    { name: "Gomi", fn: fetchGomi },
    { name: "Events", fn: fetchEvents },
    { name: "WBGT", fn: fetchWbgt },
  ];

  let hasError = false;

  for (const task of tasks) {
    try {
      await task.fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${task.name}] Fetch error: ${message}`);
      await notifyDiscord(`[koto-city] Fetch failed for ${task.name}: ${message}`);
      hasError = true;
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

// Only execute when run directly (not when imported in tests).
if (process.argv[1] && process.argv[1].endsWith("fetch-opendata.ts")) {
  main().catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}
