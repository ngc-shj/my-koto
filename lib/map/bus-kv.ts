// Single source of truth for the KV key that holds the Toei bus bundle.
// Both the runtime route (app/api/map/bus/route.ts) and the admin upload
// script (scripts/fetch-bus-toei.ts) import busKvKey() so the namespace,
// schema-version semantics, and subject cannot drift between them.
//
// Schema version is passed in by the caller so this module stays free of
// runtime-specific deps (lib/proxy pulls in @vercel/functions which is
// edge-only and would break the tsx script).

export const BUS_KV_NAMESPACE = "map-bus";
export const BUS_KV_SUBJECT = "toei:latest";

export function busKvKey(schemaVersion: number): string {
  return `${BUS_KV_NAMESPACE}:v${schemaVersion}:${BUS_KV_SUBJECT}`;
}

// Reads KV_SCHEMA_VERSION from the environment with the same default as
// lib/proxy#parseSchemaVersion. Inlined to keep this module portable
// between the edge route and the Node tsx script.
export function busKvSchemaVersion(): number {
  const raw = process.env["KV_SCHEMA_VERSION"];
  if (raw == null || raw === "") return 1;
  const n = parseInt(raw, 10);
  return isNaN(n) ? 1 : n;
}
