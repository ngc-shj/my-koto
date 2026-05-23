import type { ServiceCategory, StopDepartures } from "@/lib/opendata/schemas/bus";

// Minutes-since-midnight for a GTFS-style "HH:MM" or "HH:MM:SS" token.
// GTFS lets hours exceed 23 (e.g. "25:30" means 01:30 of the following day
// under the same service id). Returns null if the token is malformed.
export function parseBusTimeMinutes(token: string): number | null {
  const match = /^([0-9]{1,2}):([0-5][0-9])(?::([0-5][0-9]))?$/.exec(token);
  if (match == null) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  return hh * 60 + mm;
}

// Format a stored "HH:MM" / "HH:MM:SS" token for display. Hours >= 24 fold
// back into a 24h clock with a "翌" (next-day) prefix so users see the
// wall-clock value they will read at the bus stop.
export function formatBusTime(token: string): string {
  const minutes = parseBusTimeMinutes(token);
  if (minutes == null) return token;
  const isNextDay = minutes >= 24 * 60;
  const hh = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${isNextDay ? "翌" : ""}${pad(hh)}:${pad(mm)}`;
}

// Decide which schedule bucket applies to a given local date. Holiday-aware
// behavior (e.g. 国民の祝日) is intentionally deferred — Phase 1 treats
// Sunday/Saturday as the only branches the GTFS service ids cover for the
// Toei feed today. Holidays still see weekday timetables, which matches the
// way the city portal currently displays them; revisit if user feedback
// shows demand for jpholiday integration.
export function categorizeServiceDay(date: Date): ServiceCategory {
  const day = date.getDay();
  if (day === 0) return "sunday";
  if (day === 6) return "saturday";
  return "weekday";
}

// Strip a trailing chome suffix from a district label so it can seed the
// bus-stop search. Handles single digits ("塩浜1丁目" → "塩浜") and ranges
// written with wave dash ("亀戸1～3丁目" → "亀戸"). Anything that does not
// match is returned untouched.
const CHOME_SUFFIX_RE = /[0-9][0-9～〜~\-]*丁目$/;
export function stripChomeSuffix(label: string): string {
  return label.replace(CHOME_SUFFIX_RE, "").trim();
}

// Find the next N departures from `now` for a given stop's timetable.
// `now` is expected to be in the same wall-clock timezone as the timetable
// (callers should pass a Date adjusted to Asia/Tokyo).
export function nextDepartures(
  departures: StopDepartures | undefined,
  now: Date,
  limit = 5,
): readonly string[] {
  if (departures == null) return [];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const upcoming: string[] = [];
  for (const token of departures.times) {
    const minutes = parseBusTimeMinutes(token);
    if (minutes == null) continue;
    // 24h+ tokens always belong to "later today" relative to the same
    // service day, so they compare correctly against nowMinutes.
    if (minutes >= nowMinutes) {
      upcoming.push(token);
      if (upcoming.length >= limit) break;
    }
  }
  return upcoming;
}
