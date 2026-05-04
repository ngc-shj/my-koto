/**
 * Fetches real API responses and saves them to __fixtures__/opendata/*.json.
 * Also updates __fixtures__/README.md with the fetch timestamp.
 *
 * Run manually on implementation day:
 *   npx tsx scripts/refresh-fixtures.ts
 *
 * NOTE: This script performs real HTTP requests. Do NOT run in CI automatically.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATASETS, TOKYO_OPEN_DATA_API_BASE } from "@/config/opendata";

const FIXTURES_DIR = join(process.cwd(), "__fixtures__", "opendata");
const USER_AGENT = "koto-city-bot/1.0 (+https://example.com/about)";

async function fetchAndSave(name: string, url: string): Promise<void> {
  console.log(`Fetching ${name} from ${url} ...`);

  const res = await fetch(url, {
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

  const data: unknown = await res.json();
  const outputPath = join(FIXTURES_DIR, `${name}.json`);
  writeFileSync(outputPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  console.log(`  Saved: ${outputPath}`);
}

async function main(): Promise<void> {
  mkdirSync(FIXTURES_DIR, { recursive: true });

  const fetchedAt = new Date().toISOString();

  const tasks: Array<{ name: string; url: string }> = [
    {
      name: "aed",
      url: `${TOKYO_OPEN_DATA_API_BASE}/v1/dataset/${DATASETS.aed}`,
    },
    {
      name: "toilet",
      url: `${TOKYO_OPEN_DATA_API_BASE}/v1/dataset/${DATASETS.toilet}`,
    },
    {
      name: "gomi",
      url: `${TOKYO_OPEN_DATA_API_BASE}/v1/dataset/${DATASETS.gomi}`,
    },
    {
      name: "events",
      url: `${TOKYO_OPEN_DATA_API_BASE}/v1/dataset/${DATASETS.events}`,
    },
  ];

  const results: Array<{ name: string; status: "ok" | "error"; error?: string }> = [];

  for (const task of tasks) {
    try {
      await fetchAndSave(task.name, task.url);
      results.push({ name: task.name, status: "ok" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  Error: ${message}`);
      results.push({ name: task.name, status: "error", error: message });
    }
  }

  // Update __fixtures__/README.md with fetch timestamp.
  const readmePath = join(process.cwd(), "__fixtures__", "README.md");
  const rows = results
    .map((r) => `| ${r.name} | ${r.status === "ok" ? "ok" : `error: ${r.error ?? "unknown"}`} | ${fetchedAt} |`)
    .join("\n");

  const readme = `# Fixtures

Fixture files for testing Zod schemas against real API responses.

## Last fetch

| Dataset | Status | Fetched at |
|---------|--------|------------|
${rows}

## Usage

These files are committed to the repository and used in Vitest tests.
Re-run \`npx tsx scripts/refresh-fixtures.ts\` to update with fresh API data.
`;

  writeFileSync(readmePath, readme, "utf-8");
  console.log(`Updated: ${readmePath}`);

  const hasError = results.some((r) => r.status === "error");
  if (hasError) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
