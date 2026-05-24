// Single entry point for opening the libsql client. The URL defaults to
// the local file (Node + Vercel build), but production reads
// DATASETS_DB_URL + DATASETS_DB_AUTH_TOKEN so a Turso instance can take
// over without code changes.

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
  const explicit = opts.url ?? process.env["DATASETS_DB_URL"];
  // The production runtime must point at Turso — the Cron writes there,
  // not into the bundled-but-stale data/datasets.sqlite that survived
  // the build. Vercel sets VERCEL_ENV=production only for the prod
  // deployment, so Preview keeps the file fallback to stay deployable
  // without provisioning a second Turso DB.
  if (
    !explicit &&
    process.env.NODE_ENV === "production" &&
    process.env["VERCEL_ENV"] === "production"
  ) {
    throw new Error(
      "DATASETS_DB_URL is required in production. Point it at the Turso libsql:// URL and set DATASETS_DB_AUTH_TOKEN alongside it.",
    );
  }
  const url = explicit ?? DEFAULT_DB_URL;
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
