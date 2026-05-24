// IndexedDB-backed cache for the Toei bus bundle (~12 MB JSON).
// localStorage can't hold this much; IndexedDB happily takes it and
// survives across visits so the /map page does not pay the download
// twice for the same visitor.
//
// SSR-safe: every accessor is a no-op when `window`/`indexedDB` is
// absent.

import { openDB, type IDBPDatabase } from "idb";
import { MAP_BUS_CACHE } from "@/config/cache";
import { BusToeiDataSchema, type BusToeiData } from "@/lib/opendata/schemas/bus";
import { hasIndexedDB } from "@/lib/ssr";

const DB_NAME = "my-koto-map";
const DB_VERSION = 1;
const STORE = "bus";
// Single canonical key — only one bus bundle in flight at a time.
const KEY = "toei:latest";

type Envelope = {
  storedAt: number;
  data: BusToeiData;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (dbPromise == null) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function loadBusCache(): Promise<BusToeiData | null> {
  if (!hasIndexedDB()) return null;
  try {
    const db = await getDb();
    const raw = (await db.get(STORE, KEY)) as Envelope | undefined;
    if (raw == null) return null;
    if (Date.now() - raw.storedAt > MAP_BUS_CACHE.CLIENT_TTL_MS) return null;
    // Re-validate so a schema drift between writer and reader can't
    // poison the page — drop the entry instead.
    const parsed = BusToeiDataSchema.safeParse(raw.data);
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function saveBusCache(data: BusToeiData): Promise<void> {
  if (!hasIndexedDB()) return;
  try {
    const db = await getDb();
    const envelope: Envelope = { storedAt: Date.now(), data };
    await db.put(STORE, envelope, KEY);
  } catch {
    // Quota exceeded or private mode — fall back to network-only.
  }
}

export async function clearBusCache(): Promise<void> {
  if (!hasIndexedDB()) return;
  try {
    const db = await getDb();
    await db.delete(STORE, KEY);
  } catch {
    // ignore
  }
}
