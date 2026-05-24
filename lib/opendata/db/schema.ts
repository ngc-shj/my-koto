// SQLite schema for the koto-city dataset store. Tables hold the
// upstream-derived data that used to live in data/*.json — one row per
// record, columns in snake_case English, originals (Japanese keys)
// reconstructed by reader helpers when the app needs the legacy shape.
//
// `_meta` carries freshness tokens so the Cron-side sync can ask "did
// the upstream change?" without re-downloading the body (this is the
// Phase 1 Conditional-fetch contract, now persisted in SQLite instead
// of a sidecar JSON).

export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS _meta (
    source_id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS aed (
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    location_detail TEXT,
    hours TEXT,
    phone TEXT,
    note TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS toilet (
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    barrier_free TEXT,
    all_day TEXT,
    male TEXT,
    female TEXT,
    multipurpose TEXT,
    note TEXT
  )`,

  // The single column the rest of the app filters on. ICS feed and
  // homepage both want "events from today onward".
  `CREATE TABLE IF NOT EXISTS events (
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    location TEXT,
    address TEXT,
    description TEXT,
    url TEXT,
    organizer TEXT,
    note TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS events_start_date_idx ON events (start_date)`,

  // gomi (weekly collection schedule per district, upstream variant —
  // not the curated gomi-schedule.json overlays, those stay JSON for
  // now). `district_id` is actually the 1–12 route code so several rows
  // share it; the real per-row identifier is `district_name` (the
  // address).
  `CREATE TABLE IF NOT EXISTS gomi (
    district_name TEXT NOT NULL PRIMARY KEY,
    district_id TEXT NOT NULL,
    burnable_days TEXT NOT NULL,         -- JSON array of weekday strings
    non_burnable_days TEXT NOT NULL,
    plastic_days TEXT NOT NULL,
    resource_days TEXT NOT NULL
  )`,

  // Bus is the odd one out. The upstream is a single ~13 MB JSON bundle
  // (routes + stops + shapes + schedules per direction), and every
  // consumer in the app reads it whole. Storing it as a BLOB instead of
  // normalising into half a dozen tables keeps consumer code unchanged
  // — the read fn parses the JSON once. `agency` leaves room for a
  // future second agency (Toei is the only one for now).
  `CREATE TABLE IF NOT EXISTS bus (
    agency TEXT NOT NULL PRIMARY KEY,
    data BLOB NOT NULL,
    fetched_at TEXT NOT NULL
  )`,
] as const;
