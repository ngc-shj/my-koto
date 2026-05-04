import { format } from "date-fns";
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
// schedule. Biweekly categories are skipped on purpose: the upstream CSV
// publishes only the weekday (e.g. 「（隔週）土」) without the anchor week,
// so emitting them weekly would over-report by 50 % every second week
// (T-04). The dedicated biweekly UI panel + the upstream link cover the
// gap until/unless an authoritative anchor calendar becomes available.
function isBiweekly(district: District, cat: GomiCategory): boolean {
  return district.schedule.biweekly?.[cat] === true;
}

function categoriesFromWeekly(
  district: District,
  date: Date,
): GomiCategory[] {
  const weekday = ISO_DAY_MAP[date.getDay()];
  return CATEGORIES.filter(
    (cat) =>
      !isBiweekly(district, cat) &&
      district.schedule[cat].includes(weekday),
  );
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
//
// NOTE on biweekly cadence (T-04 deferral):
// The upstream CSV marks `非燃焼ごみ` as `（隔週）<weekday>` for ~58 of the
// 58 collection routes. The current schema treats those as weekly, which
// over-reports collection by 50%. A faithful biweekly implementation
// requires (a) extending the schema with an anchor date, (b) carrying
// the boolean through `generate-districts.mjs`, and (c) integration tests
// across DST/calendar boundaries — out of scope for the MVP. Tracked in
// docs/archive/review/koto-mvp-deviation.md as "Phase 2 — biweekly".
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
