import { format } from "date-fns";
import { isBiweeklyCollectionDate } from "./biweekly-anchors";
import type {
  DateRange,
  District,
  GomiCategory,
  GomiOccurrence,
  SpecialOverlay,
  Weekday,
} from "./types";

// ISO weekday index (0=Sun) → Weekday string.
const ISO_DAY_MAP: Record<number, Weekday> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

// All category keys in order.
const CATEGORIES: GomiCategory[] = [
  "burnable",
  "non_burnable",
  "resource_plastic",
  "container_plastic",
  "pet_bottle",
  "bottles_cans",
  "bulky",
];

// Enumerate every date from range.from to range.to (inclusive).
function eachDayInRange(range: DateRange): Date[] {
  const days: Date[] = [];
  const cursor = new Date(range.from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(range.to);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// Determine which categories are collected on a given date using the weekly
// schedule. Biweekly categories use the area-code anchor table from
// `biweekly-anchors.ts` to decide which 14-day boundary actually fires —
// over-reporting (the previous skip-everything default) is no longer
// necessary now that we encode the published anchor calendar.
function isBiweekly(district: District, cat: GomiCategory): boolean {
  return district.schedule.biweekly?.[cat] === true;
}

function categoriesFromWeekly(
  district: District,
  date: Date,
): GomiCategory[] {
  const weekday = ISO_DAY_MAP[date.getDay()];
  return CATEGORIES.filter((cat) => {
    if (!district.schedule[cat].includes(weekday)) return false;
    if (!isBiweekly(district, cat)) return true;
    // Biweekly stream — only emit on the area-code anchor's 14-day
    // boundary. Districts without a known area code conservatively
    // suppress the stream so the UI / ICS never claim a wrong date.
    if (district.areaCode === undefined) return false;
    return isBiweeklyCollectionDate(district.areaCode, date);
  });
}

// Lists biweekly categories for the district along with their nominal
// weekday, for UI rendering. Empty array when none.
export function biweeklyCategories(
  district: District,
): Array<{ category: GomiCategory; weekday: Weekday }> {
  return CATEGORIES.filter((cat) => isBiweekly(district, cat))
    .map((cat) => ({
      category: cat,
      weekday: district.schedule[cat][0],
    }))
    .filter((entry): entry is { category: GomiCategory; weekday: Weekday } =>
      entry.weekday !== undefined,
    );
}

// Apply a special overlay: REPLACE the day's collection set entirely with
// the overlay's explicit category list. The previous shape merged a
// per-weekday partial schedule into the weekly result, which silently
// dropped overlay days when an editor mis-aligned the weekday array with
// the literal date (F-04 root cause).
function applyOverlay(overlay: SpecialOverlay): GomiCategory[] {
  // Preserve canonical category ordering for stable rendering.
  const set = new Set<GomiCategory>(overlay.categories);
  return CATEGORIES.filter((cat) => set.has(cat));
}

/**
 * Resolve the garbage collection schedule for a district over a date range.
 *
 * Combines the district's normal weekly schedule with any special overlays
 * that apply on each date. Overlays take full precedence over weekly patterns
 * for the categories they explicitly specify.
 *
 * @param district - District master record including normal weekly schedule.
 * @param overlays - All special date overlays (filtered internally by district).
 * @param range - Inclusive date range to resolve.
 * @returns Array of GomiOccurrence, one per day that has at least one category.
 */
export function resolveSchedule(
  district: District,
  overlays: SpecialOverlay[],
  range: DateRange,
): GomiOccurrence[] {
  const days = eachDayInRange(range);

  return days
    .map((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const matchingOverlay = overlays.find(
        (o) => o.date === dateStr && o.districts.includes(district.id),
      );

      const categories = matchingOverlay
        ? applyOverlay(matchingOverlay)
        : categoriesFromWeekly(district, date);

      return { date, categories };
    })
    .filter((occ) => occ.categories.length > 0);
}
