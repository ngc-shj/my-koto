// Single entry point for opening the libsql client. The URL defaults to
// the local file (Node + Vercel build), but production reads
// DATASETS_DB_URL + DATASETS_DB_AUTH_TOKEN so a Turso instance can take
// over without code changes. Phase 4 will set those env vars on Vercel;
// Phase 2/3 stays on the file URL.

import { createClient, type Client } from "@libsql/client";
import { SCHEMA_STATEMENTS } from "./schema";

export const DEFAULT_DB_URL = "file:./data/datasets.sqlite";

export type OpenDbOptions = {
  url?: string;
  authToken?: string;
};

let cachedClient: Client | null = null;
let cachedUrl: string | null = null;

export function openDatasetsDb(opts: OpenDbOptions = {}): Client {
  const url =
    opts.url ?? process.env["DATASETS_DB_URL"] ?? DEFAULT_DB_URL;
  const authToken =
    opts.authToken ?? process.env["DATASETS_DB_AUTH_TOKEN"];
  // Reuse the connection within a single process — libsql Client is
  // thread-safe and pooling is internal, so building one per call would
  // wastefully reopen the underlying connection on every server-side
  // render.
  if (cachedClient && cachedUrl === url) return cachedClient;
  cachedClient?.close();
  cachedClient = createClient({ url, authToken });
  cachedUrl = url;
  return cachedClient;
}

// Idempotent — every CREATE TABLE statement uses IF NOT EXISTS.
export async function ensureSchema(client: Client): Promise<void> {
  for (const stmt of SCHEMA_STATEMENTS) {
    await client.execute(stmt);
  }
}
