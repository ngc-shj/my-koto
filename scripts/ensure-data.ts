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
 *   - Conditional upstream probing is now the default: every run HEADs
 *     each source (and pokes CKAN `package_show.metadata_modified`) and
 *     regenerates groups whose source moved since `data/.versions.json`
 *     was last written (~1–2 s network overhead, mostly 304s after the
 *     first run).
 *   - `--skip-upstream-check` (or env SKIP_UPSTREAM_CHECK=1) reverts to
 *     presence-only mode for offline dev or transient upstream outages.
 *
 * Curated files (`gomi-dictionary.json`, `gomi-schedule.json`) are NOT
 * listed here — they have no upstream and are tracked by git directly.
 *
 * Note: the upstream URLs below shadow the ones in generate-*.ts /
 * fetch-bus-toei.ts (config/opendata.ts for the latter). Keep them
 * in sync if the source moves.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatasetsDb, ensureSchema } from "@/lib/opendata/db/client";
import { readMetaVersion } from "@/lib/opendata/db/readers";
import {
  writeAed,
  writeBus,
  writeEvents,
  writeGomi,
  writeToilet,
} from "@/lib/opendata/db/writers";
import { fetchAedDatasetConditional } from "@/lib/opendata/datasets/aed";
import { fetchToiletDatasetConditional } from "@/lib/opendata/datasets/toilet";
import { fetchEventsDatasetConditional } from "@/lib/opendata/datasets/events";
import { fetchGomiDatasetConditional } from "@/lib/opendata/datasets/gomi";
import { BusToeiDataSchema } from "@/lib/opendata/schemas/bus";
import { BUNDLE_FORMAT_VERSION } from "./fetch-bus-toei";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCE = process.argv.includes("--force") || process.env.FORCE === "1";
// Conditional upstream probing is now the default. Pass --skip-upstream-check
// (or SKIP_UPSTREAM_CHECK=1) to fall back to presence-only mode, useful in
// offline dev or when the upstream is temporarily unreachable.
const SKIP_UPSTREAM_CHECK =
  process.argv.includes("--skip-upstream-check") ||
  process.env.SKIP_UPSTREAM_CHECK === "1";
const CHECK_UPSTREAM = !SKIP_UPSTREAM_CHECK;
// Skip the JSON-file generators entirely (districts/pois/bus). Useful
// for the Turso Cron path, which only needs the libsql snapshot
// refreshed and doesn't care about disk JSON files in the CI runner.
const DYNAMIC_ONLY =
  process.argv.includes("--dynamic-only") ||
  process.env.DYNAMIC_ONLY === "1";

const SIDECAR_PATH = join(ROOT, "data", ".versions.json");
const UPSTREAM_TIMEOUT_MS = 10_000;
const USER_AGENT = "my-koto-ensure-data/1.0 (+/about)";
const CKAN_API =
  "https://catalog.data.metro.tokyo.lg.jp/api/3/action/package_show";

export type GroupSpec = {
  name: string;
  files: readonly string[];
  cmd: readonly [string, readonly string[]];
};

export type SourceSpec =
  | { id: string; group: string; kind: "head"; url: string }
  | { id: string; group: string; kind: "ckan"; datasetId: string };

type Sidecar = Record<string, string>;

// One entry per generator script. The script runs iff any of its files
// is missing (or --force, or --check-upstream sees an updated source).
const GROUPS: readonly GroupSpec[] = [
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

// Each upstream source the generators read, tagged with the group that
// regenerates when the source changes. Per source we either ask CKAN for
// `metadata_modified` (cheap, accurate) or do a HEAD and read
// `Last-Modified` (one round trip, no body).
const SOURCES: readonly SourceSpec[] = [
  {
    id: "districts:waste-csv",
    group: "districts",
    kind: "head",
    url: "https://www.opendata.metro.tokyo.lg.jp/koto/131083_201_kotocity_waste_recycle_collectionday.csv",
  },
  {
    id: "pois:ckan-evacuation-bundle",
    group: "pois",
    kind: "ckan",
    datasetId: "t000003d0000000093", // shelter + assembly_point
  },
  {
    id: "pois:ckan-water-supply",
    group: "pois",
    kind: "ckan",
    datasetId: "t000019d0000000001",
  },
  {
    id: "pois:koto-park",
    group: "pois",
    kind: "head",
    url: "https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-17_parks.csv",
  },
  {
    id: "pois:koto-library",
    group: "pois",
    kind: "head",
    url: "https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-25_libraries.csv",
  },
  {
    id: "pois:koto-child-center",
    group: "pois",
    kind: "head",
    url: "https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-9_childrensclubhouses.csv",
  },
  {
    id: "pois:koto-nursery",
    group: "pois",
    kind: "head",
    url: "https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-10_municipal_childrens_daycare_centers.csv",
  },
  {
    id: "bus:toei-gtfs",
    group: "bus",
    kind: "head",
    url: "https://api-public.odpt.org/api/v4/files/Toei/data/ToeiBus-GTFS.zip",
  },
];

function run(cmd: string, args: readonly string[]): void {
  console.log(`\n[ensure-data] $ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, [...args], { stdio: "inherit", cwd: ROOT });
  if (result.status !== 0) {
    console.error(`[ensure-data] FAILED: ${cmd} ${args.join(" ")}`);
    process.exit(1);
  }
}

function readSidecar(): Sidecar {
  if (!existsSync(SIDECAR_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(SIDECAR_PATH, "utf-8")) as unknown;
    return raw && typeof raw === "object" ? (raw as Sidecar) : {};
  } catch {
    return {};
  }
}

function writeSidecar(data: Sidecar): void {
  writeFileSync(SIDECAR_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// Last-Modified probe. Tries HEAD first (cheapest), falls back to a
// 1-byte ranged GET when the server rejects HEAD — the ODPT bus GTFS
// mirror, for instance, returns 404 on HEAD but 206 on `Range: bytes=0-0`.
async function probeLastModified(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (res.ok) return res.headers.get("last-modified") ?? "";
  } catch {
    /* fall through to GET */
  }
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT, Range: "bytes=0-0" },
    redirect: "follow",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`GET ${url}: HTTP ${res.status}`);
  }
  // Drain the (1-byte) body so the connection releases promptly.
  await res.arrayBuffer().catch(() => {});
  return res.headers.get("last-modified") ?? "";
}

async function getRemoteVersion(src: SourceSpec): Promise<string> {
  if (src.kind === "head") {
    return probeLastModified(src.url);
  }
  const url = `${CKAN_API}?id=${encodeURIComponent(src.datasetId)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`CKAN ${src.datasetId}: HTTP ${res.status}`);
  const body = (await res.json()) as {
    result?: { metadata_modified?: string };
  };
  return body.result?.metadata_modified ?? "";
}

// Pure decision: given which files exist and what the upstream reported,
// pick the groups to regenerate. Extracted from main() so the
// presence/upstream/force interaction can be tested without spinning up
// real fs or network mocks.
export type GroupDecision = {
  toRun: Set<string>;
  staleSummary: string[];
};

export function selectGroupsToRun(args: {
  groups: readonly GroupSpec[];
  sources: readonly SourceSpec[];
  missingByGroup: ReadonlyMap<string, readonly string[]>;
  // For each source id, the remote-vs-local comparison the caller already did.
  // 'fresh' = no work needed; 'stale' = upstream moved; 'check-failed' = network/HTTP
  // error during probe (treated like stale to avoid silent staleness).
  upstreamStatus: ReadonlyMap<string, "fresh" | "stale" | "check-failed">;
  force: boolean;
}): GroupDecision {
  const toRun = new Set<string>();
  const staleSummary: string[] = [];

  if (args.force) {
    for (const g of args.groups) toRun.add(g.name);
    return { toRun, staleSummary: ["--force: regenerating all groups"] };
  }

  for (const group of args.groups) {
    const missing = args.missingByGroup.get(group.name) ?? [];
    if (missing.length > 0) {
      toRun.add(group.name);
      staleSummary.push(
        `${group.name}: missing ${missing.length} file(s) (${missing.join(", ")})`,
      );
    }
  }

  for (const src of args.sources) {
    const status = args.upstreamStatus.get(src.id);
    if (status === "stale") {
      toRun.add(src.group);
      staleSummary.push(`${src.group}: upstream changed (${src.id})`);
    } else if (status === "check-failed") {
      toRun.add(src.group);
      staleSummary.push(`${src.group}: upstream check failed (${src.id})`);
    }
  }

  return { toRun, staleSummary };
}

async function main(): Promise<void> {
  if (DYNAMIC_ONLY) {
    // Cron-against-Turso path: only the libsql dynamic datasets matter;
    // the JSON-file groups would just churn CI disk for nothing.
    console.log("[ensure-data] --dynamic-only: skipping JSON groups.");
    await syncDynamicDatasets();
    console.log("\n[ensure-data] done.");
    return;
  }

  const sidecar = readSidecar();

  // Presence check: any missing file marks its group for regen.
  const missingByGroup = new Map<string, readonly string[]>();
  for (const group of GROUPS) {
    const missing = group.files.filter((f) => !existsSync(join(ROOT, f)));
    if (missing.length > 0) missingByGroup.set(group.name, missing);
  }

  // Upstream freshness check (optional, slower).
  const remoteVersions: Sidecar = {};
  const upstreamStatus = new Map<
    string,
    "fresh" | "stale" | "check-failed"
  >();
  if (CHECK_UPSTREAM) {
    console.log("[ensure-data] checking upstream freshness...");
    for (const src of SOURCES) {
      try {
        const remote = await getRemoteVersion(src);
        remoteVersions[src.id] = remote;
        const local = sidecar[src.id] ?? "";
        if (remote && remote !== local) {
          console.log(
            `  - stale ${src.id}: local=${local || "<none>"}, remote=${remote}`,
          );
          upstreamStatus.set(src.id, "stale");
        } else {
          console.log(`  - fresh ${src.id}`);
          upstreamStatus.set(src.id, "fresh");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `  - check failed for ${src.id} (${msg}); will refresh ${src.group} to be safe.`,
        );
        upstreamStatus.set(src.id, "check-failed");
      }
    }
  }

  const { toRun, staleSummary } = selectGroupsToRun({
    groups: GROUPS,
    sources: SOURCES,
    missingByGroup,
    upstreamStatus,
    force: FORCE,
  });

  if (toRun.size === 0) {
    console.log("[ensure-data] static data fresh, no JSON regeneration.");
  } else {
    console.log(`[ensure-data] groups to refresh: ${[...toRun].join(", ")}`);
    for (const reason of staleSummary) console.log(`  reason: ${reason}`);

    for (const group of GROUPS) {
      if (!toRun.has(group.name)) continue;
      run(group.cmd[0], group.cmd[1]);
    }

    // Persist whatever remote versions we observed so the next
    // --check-upstream call has a baseline. Skip when we never asked.
    if (CHECK_UPSTREAM) {
      writeSidecar({ ...sidecar, ...remoteVersions });
      console.log(`[ensure-data] sidecar updated: ${SIDECAR_PATH}`);
    }
  }

  // Dynamic datasets live in data/datasets.sqlite. The 4 CKAN-resolved
  // sources (aed/toilet/events/gomi) used to be fetched per request by
  // the /api/datasets/* routes or per ISR by SSR pages; now they're
  // refreshed here using the same Conditional-fetch helpers so SSR and
  // future Edge readers stay off the upstream.
  await syncDynamicDatasets();

  console.log("\n[ensure-data] done.");
}

async function syncDynamicDatasets(): Promise<void> {
  console.log("\n[ensure-data] syncing dynamic datasets → libsql...");
  const db = openDatasetsDb();
  await ensureSchema(db);

  type Job<T> = {
    id: string;
    fetcher: (
      prev: string | undefined,
    ) => Promise<import("@/lib/opendata/datasets/source").ConditionalLoadResult<T>>;
    writer: (db: ReturnType<typeof openDatasetsDb>, data: T, meta: { sourceId: string; version: string }) => Promise<void>;
  };

  const jobs: Array<Job<unknown>> = [
    { id: "aed", fetcher: fetchAedDatasetConditional, writer: writeAed as never },
    { id: "toilet", fetcher: fetchToiletDatasetConditional, writer: writeToilet as never },
    { id: "events", fetcher: fetchEventsDatasetConditional, writer: writeEvents as never },
    { id: "gomi", fetcher: fetchGomiDatasetConditional, writer: writeGomi as never },
  ];

  for (const job of jobs) {
    const prev = FORCE ? undefined : await readMetaVersion(db, job.id);
    try {
      const result = await job.fetcher(prev);
      if (result.unchanged) {
        console.log(`  - ${job.id}: unchanged (version ${result.version})`);
        continue;
      }
      await job.writer(db, result.data, {
        sourceId: job.id,
        version: result.version,
      });
      console.log(`  - ${job.id}: refreshed (version ${result.version})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  - ${job.id}: FAILED (${msg}); keeping existing rows`);
    }
  }

  // Bus is special: the upstream is a single 80 MB GTFS zip, parsing
  // happens in scripts/fetch-bus-toei.ts (which writes data/bus-toei.json
  // as a side product). We probe Last-Modified first; only when the zip
  // actually moved do we spawn the generator (or reuse the JSON if it's
  // already on disk from the JSON-group flow) and write the BLOB.
  try {
    await syncBus(db);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  - bus: FAILED (${msg}); keeping existing row`);
  }
}

const BUS_GTFS_URL =
  "https://api-public.odpt.org/api/v4/files/Toei/data/ToeiBus-GTFS.zip";

// Bundle the I/O that syncBus reaches for so tests can swap each
// dependency without monkey-patching modules.
export type SyncBusDeps = {
  probe: (url: string) => Promise<string>;
  exists: (path: string) => boolean;
  readJsonRaw: (path: string) => string;
  runSpawn: (cmd: string, args: readonly string[]) => void;
};

const DEFAULT_BUS_DEPS: SyncBusDeps = {
  probe: probeLastModified,
  exists: existsSync,
  readJsonRaw: (p) => readFileSync(p, "utf-8"),
  runSpawn: run,
};

// Composite version string stored alongside the bus bundle. The
// `@bundle{N}` suffix forces a refresh when the fetcher's output
// shape changes (BUNDLE_FORMAT_VERSION bumped) even if upstream
// Last-Modified hasn't moved — that's the path-based deploy fix
// for the variants rollout.
function composeBusVersion(remoteVersion: string): string {
  return `${remoteVersion}@bundle${BUNDLE_FORMAT_VERSION}`;
}

export async function syncBus(
  db: ReturnType<typeof openDatasetsDb>,
  opts: { force?: boolean; deps?: Partial<SyncBusDeps> } = {},
): Promise<void> {
  const deps: SyncBusDeps = { ...DEFAULT_BUS_DEPS, ...(opts.deps ?? {}) };
  const force = opts.force ?? FORCE;
  const remoteVersion = await deps.probe(BUS_GTFS_URL);
  const composite = composeBusVersion(remoteVersion);
  const prev = force ? undefined : await readMetaVersion(db, "bus");
  if (prev && remoteVersion && prev === composite) {
    console.log(`  - bus: unchanged (${composite})`);
    return;
  }
  const jsonPath = join(ROOT, "data", "bus-toei.json");
  if (!deps.exists(jsonPath)) {
    console.log("  - bus: invoking fetch-bus-toei.ts (no local JSON)...");
    deps.runSpawn("npx", ["--yes", "tsx", "scripts/fetch-bus-toei.ts"]);
  }
  const raw: unknown = JSON.parse(deps.readJsonRaw(jsonPath));
  const parsed = BusToeiDataSchema.parse(raw);
  await writeBus(db, "toei", parsed, {
    sourceId: "bus",
    version: remoteVersion
      ? composite
      : `${parsed.feedVersion}@bundle${BUNDLE_FORMAT_VERSION}`,
  });
  console.log(`  - bus: refreshed (${composite})`);
}

// Only fire main() when invoked directly (`tsx scripts/ensure-data.ts`),
// not when imported by the unit tests below. Matches the gate used in
// scripts/fetch-bus-toei.ts.
if (process.argv[1] && process.argv[1].endsWith("ensure-data.ts")) {
  main().catch((err) => {
    console.error(`[ensure-data] error: ${err.stack ?? err.message}`);
    process.exit(1);
  });
}
