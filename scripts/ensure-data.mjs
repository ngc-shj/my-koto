#!/usr/bin/env node
/**
 * Make sure every `data/*.json` consumed at build time by an `import`
 * statement is present on disk. Generated data is gitignored, so a fresh
 * clone (or a CI runner) has none of them — running this from
 * `predev`/`prebuild`/`pretest` fills them in automatically.
 *
 * Strategy: incremental by generator script.
 *   - Files are grouped by which script produces them.
 *   - A group whose files are all present is skipped — its script does
 *     not run. So if only `data/bus-toei.json` is missing, only the
 *     bus fetcher runs (~10–15 s) instead of all three generators.
 *   - `--force` (or env FORCE=1) regenerates every group regardless.
 *
 * Curated files (`gomi-dictionary.json`, `gomi-schedule.json`) are NOT
 * listed here — they have no upstream and are tracked by git directly.
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCE = process.argv.includes("--force") || process.env.FORCE === "1";

// One entry per generator script. The script runs iff any of its files
// is missing (or --force).
const GROUPS = [
  {
    name: "districts",
    files: ["data/districts.json"],
    cmd: ["node", ["scripts/generate-districts.mjs"]],
  },
  {
    name: "pois",
    files: [
      "data/shelter.json",
      "data/assembly_point.json",
      "data/water_supply.json",
      "data/park.json",
      "data/library.json",
      "data/child_center.json",
      "data/nursery.json",
    ],
    cmd: ["npx", ["--yes", "tsx", "scripts/generate-pois.ts"]],
  },
  {
    name: "bus",
    files: ["data/bus-toei.json"],
    cmd: ["npx", ["--yes", "tsx", "scripts/fetch-bus-toei.ts"]],
  },
];

function run(cmd, args) {
  console.log(`\n[ensure-data] $ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });
  if (result.status !== 0) {
    console.error(`[ensure-data] FAILED: ${cmd} ${args.join(" ")}`);
    process.exit(1);
  }
}

let ranAny = false;
for (const group of GROUPS) {
  const missing = group.files.filter((f) => !existsSync(join(ROOT, f)));
  if (!FORCE && missing.length === 0) {
    console.log(`[ensure-data] ${group.name}: all files present, skipping.`);
    continue;
  }
  if (FORCE) {
    console.log(`[ensure-data] ${group.name}: --force, regenerating.`);
  } else {
    console.log(
      `[ensure-data] ${group.name}: missing ${missing.length} file(s) (${missing.join(", ")}), regenerating.`,
    );
  }
  run(group.cmd[0], group.cmd[1]);
  ranAny = true;
}

if (!ranAny) {
  console.log("[ensure-data] nothing to do.");
} else {
  console.log("\n[ensure-data] done.");
}
