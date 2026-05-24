#!/usr/bin/env node
/**
 * Make sure every `data/*.json` consumed at build time by an `import`
 * statement is present on disk. Generated data is gitignored, so a fresh
 * clone (or a CI runner) has none of them — running this from
 * `predev`/`prebuild`/`pretest` fills them in automatically.
 *
 * Strategy:
 *   - If every required file already exists, exit immediately. Subsequent
 *     `npm run dev`/`npm test` calls pay zero cost.
 *   - Otherwise run all three generator scripts in sequence. First run
 *     after clone takes ~30–60 s (Toei GTFS zip is the heavy step).
 *
 * Curated files (`gomi-dictionary.json`, `gomi-schedule.json`) are NOT
 * listed here — they have no upstream and are tracked by git directly.
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FILES = [
  "data/districts.json",
  "data/shelter.json",
  "data/assembly_point.json",
  "data/water_supply.json",
  "data/park.json",
  "data/library.json",
  "data/child_center.json",
  "data/nursery.json",
  "data/bus-toei.json",
];

const missing = REQUIRED_FILES.filter((f) => !existsSync(join(ROOT, f)));
if (missing.length === 0) {
  console.log("[ensure-data] all generated data files present, skipping.");
  process.exit(0);
}

console.log(`[ensure-data] missing ${missing.length} file(s):`);
for (const f of missing) console.log(`  - ${f}`);
console.log("[ensure-data] regenerating from upstream...");

function run(cmd, args) {
  console.log(`\n[ensure-data] $ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });
  if (result.status !== 0) {
    console.error(`[ensure-data] FAILED: ${cmd} ${args.join(" ")}`);
    process.exit(1);
  }
}

// Order is arbitrary — the three scripts are independent.
run("node", ["scripts/generate-districts.mjs"]);
run("npx", ["--yes", "tsx", "scripts/generate-pois.ts"]);
run("npx", ["--yes", "tsx", "scripts/fetch-bus-toei.ts"]);

console.log("\n[ensure-data] done.");
