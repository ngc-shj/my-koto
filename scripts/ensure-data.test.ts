// @vitest-environment node
// Tests touch a real ::memory: libsql client and exercise the BLOB
// round-trip in syncBus; jsdom shadows Node's ArrayBuffer constructor
// and breaks the BLOB instanceof check in lib/opendata/db/readers.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { ensureSchema } from "@/lib/opendata/db/client";
import { readBus, readMetaVersion } from "@/lib/opendata/db/readers";
import { writeBus } from "@/lib/opendata/db/writers";
import {
  selectGroupsToRun,
  syncBus,
  type GroupSpec,
  type SourceSpec,
  type SyncBusDeps,
} from "./ensure-data";
import type { BusToeiData } from "@/lib/opendata/schemas/bus";

const GROUPS: readonly GroupSpec[] = [
  { name: "districts", files: ["data/districts.json"], cmd: ["node", []] },
  { name: "pois", files: ["data/park.json", "data/library.json"], cmd: ["node", []] },
  { name: "bus", files: ["data/bus-toei.json"], cmd: ["node", []] },
];

const SOURCES: readonly SourceSpec[] = [
  { id: "districts:csv", group: "districts", kind: "head", url: "https://x/d.csv" },
  { id: "pois:ckan", group: "pois", kind: "ckan", datasetId: "p1" },
  { id: "bus:gtfs", group: "bus", kind: "head", url: "https://x/bus.zip" },
];

describe("selectGroupsToRun", () => {
  it("returns an empty set when all files are present and upstream is fresh", () => {
    const decision = selectGroupsToRun({
      groups: GROUPS,
      sources: SOURCES,
      missingByGroup: new Map(),
      upstreamStatus: new Map([
        ["districts:csv", "fresh"],
        ["pois:ckan", "fresh"],
        ["bus:gtfs", "fresh"],
      ]),
      force: false,
    });
    expect(decision.toRun.size).toBe(0);
    expect(decision.staleSummary).toEqual([]);
  });

  it("includes a group whose file is missing", () => {
    const decision = selectGroupsToRun({
      groups: GROUPS,
      sources: SOURCES,
      missingByGroup: new Map([["pois", ["data/park.json"]]]),
      upstreamStatus: new Map(),
      force: false,
    });
    expect([...decision.toRun]).toEqual(["pois"]);
    expect(decision.staleSummary).toEqual([
      "pois: missing 1 file(s) (data/park.json)",
    ]);
  });

  it("includes a group whose upstream went stale", () => {
    const decision = selectGroupsToRun({
      groups: GROUPS,
      sources: SOURCES,
      missingByGroup: new Map(),
      upstreamStatus: new Map([["bus:gtfs", "stale"]]),
      force: false,
    });
    expect([...decision.toRun]).toEqual(["bus"]);
    expect(decision.staleSummary).toEqual([
      "bus: upstream changed (bus:gtfs)",
    ]);
  });

  it("includes a group whose upstream probe errored (defensive)", () => {
    const decision = selectGroupsToRun({
      groups: GROUPS,
      sources: SOURCES,
      missingByGroup: new Map(),
      upstreamStatus: new Map([["pois:ckan", "check-failed"]]),
      force: false,
    });
    expect([...decision.toRun]).toEqual(["pois"]);
    expect(decision.staleSummary).toEqual([
      "pois: upstream check failed (pois:ckan)",
    ]);
  });

  it("--force returns every group regardless of presence/upstream", () => {
    const decision = selectGroupsToRun({
      groups: GROUPS,
      sources: SOURCES,
      missingByGroup: new Map(),
      upstreamStatus: new Map([
        ["districts:csv", "fresh"],
        ["pois:ckan", "fresh"],
        ["bus:gtfs", "fresh"],
      ]),
      force: true,
    });
    expect([...decision.toRun].sort()).toEqual(["bus", "districts", "pois"]);
    expect(decision.staleSummary).toEqual(["--force: regenerating all groups"]);
  });
});

describe("syncBus", () => {
  let db: Client;

  const sampleBus: BusToeiData = {
    fetchedAt: "2026-05-24T00:00:00.000Z",
    feedVersion: "20260524",
    source: "https://api-public.odpt.org/api/v4/files/Toei/data/ToeiBus-GTFS.zip",
    license: {
      name: "CC-BY 4.0",
      url: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    },
    stops: {
      A1: { stopId: "A1", name: "豊洲駅前", lat: 35.654, lng: 139.795 },
    },
    routes: [],
  };

  const sampleBusJson = JSON.stringify(sampleBus);

  function depsWith(overrides: Partial<SyncBusDeps>): SyncBusDeps {
    return {
      probe: vi.fn(async () => "Wed, 01 Apr 2026 00:00:00 GMT"),
      exists: vi.fn(() => true),
      readJsonRaw: vi.fn(() => sampleBusJson),
      runSpawn: vi.fn(() => {}),
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await ensureSchema(db);
  });

  it("skips fetch + spawn + write when prev version equals remote (cache hit)", async () => {
    const VERSION = "Wed, 01 Apr 2026 00:00:00 GMT";
    // Seed _meta + bus row so the prev/remote comparison short-circuits.
    await writeBus(db, "toei", sampleBus, { sourceId: "bus", version: VERSION });
    const deps = depsWith({ probe: vi.fn(async () => VERSION) });
    await syncBus(db, { deps });
    expect(deps.exists).not.toHaveBeenCalled();
    expect(deps.readJsonRaw).not.toHaveBeenCalled();
    expect(deps.runSpawn).not.toHaveBeenCalled();
    // The seeded bus row still resolves on read.
    const fromDb = await readBus(db, "toei");
    expect(fromDb.feedVersion).toBe("20260524");
  });

  it("when JSON is on disk and version changed, reads it and writes BLOB (no spawn)", async () => {
    const deps = depsWith({
      probe: vi.fn(async () => "Thu, 02 Apr 2026 00:00:00 GMT"),
      exists: vi.fn(() => true),
    });
    await syncBus(db, { deps });
    expect(deps.runSpawn).not.toHaveBeenCalled();
    expect(deps.readJsonRaw).toHaveBeenCalledTimes(1);
    const written = await readBus(db, "toei");
    expect(written.feedVersion).toBe("20260524");
    expect(await readMetaVersion(db, "bus")).toBe(
      "Thu, 02 Apr 2026 00:00:00 GMT",
    );
  });

  it("when JSON is missing, spawns fetch-bus-toei.ts before reading it", async () => {
    let exists = false;
    const runSpawn = vi.fn(() => {
      // The real script writes data/bus-toei.json — emulate that side effect.
      exists = true;
    });
    const deps = depsWith({
      exists: vi.fn(() => exists),
      runSpawn,
    });
    await syncBus(db, { deps });
    expect(runSpawn).toHaveBeenCalledTimes(1);
    expect(runSpawn).toHaveBeenCalledWith("npx", [
      "--yes",
      "tsx",
      "scripts/fetch-bus-toei.ts",
    ]);
    expect(await readMetaVersion(db, "bus")).toBeTruthy();
  });

  it("force=true ignores the prev cache and refreshes", async () => {
    const VERSION = "Wed, 01 Apr 2026 00:00:00 GMT";
    await writeBus(db, "toei", sampleBus, { sourceId: "bus", version: VERSION });
    const deps = depsWith({ probe: vi.fn(async () => VERSION) });
    await syncBus(db, { deps, force: true });
    // exists/readJson get touched because the short-circuit was bypassed.
    expect(deps.exists).toHaveBeenCalled();
    expect(deps.readJsonRaw).toHaveBeenCalled();
  });
});
