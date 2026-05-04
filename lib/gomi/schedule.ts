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

// Determine which categories are collected on a given date using the weekly schedule.
function categoriesFromWeekly(
  district: District,
  date: Date,
): GomiCategory[] {
  const weekday = ISO_DAY_MAP[date.getDay()];
  return CATEGORIES.filter((cat) =>
    district.schedule[cat].includes(weekday),
  );
}

// Apply a special overlay to a base category set.
// For each category present in the override, replace the weekly result
// with whether the current weekday appears in the override array.
function applyOverlay(
  baseCategories: GomiCategory[],
  overlay: SpecialOverlay,
  date: Date,
): GomiCategory[] {
  const weekday = ISO_DAY_MAP[date.getDay()];
  const result = new Set<GomiCategory>(baseCategories);

  for (const cat of CATEGORIES) {
    const overrideDays = overlay.override[cat];
    if (overrideDays === undefined) continue;
    // Override explicitly sets which days this category is collected.
    // Remove from result if not in override, add if in override.
    if (overrideDays.includes(weekday)) {
      result.add(cat);
    } else {
      result.delete(cat);
    }
  }

  return CATEGORIES.filter((cat) => result.has(cat));
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
        ? applyOverlay(categoriesFromWeekly(district, date), matchingOverlay, date)
        : categoriesFromWeekly(district, date);

      return { date, categories };
    })
    .filter((occ) => occ.categories.length > 0);
}
