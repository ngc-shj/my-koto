import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";

// One source of truth for date/time strings rendered anywhere in the app.
//
// Every helper accepts either a `Date` or an ISO-8601 string so call
// sites do not have to parse the value defensively. Invalid input is
// passed through unchanged for date-string inputs and yields the empty
// string for invalid `Date` instances — never throws.
//
// Time zone policy: every helper renders in Asia/Tokyo regardless of the
// runtime locale. The "audit" variants additionally append "JST" so
// server-side timestamps shown on /status make the zone explicit.

const TIMEZONE = "Asia/Tokyo";

function toDate(input: Date | string): Date | null {
  if (typeof input === "string") {
    const d = parseISO(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return Number.isNaN(input.getTime()) ? null : input;
}

// "5月23日(土)" — day with abbreviated Japanese weekday in half-width parens.
// Use for daily contexts (forecasts, gomi collection day, event listings)
// where the year is unambiguous from surrounding text.
export function formatDayWithWeekday(input: Date | string): string {
  const d = toDate(input);
  if (d == null) return typeof input === "string" ? input : "";
  return formatInTimeZone(d, TIMEZONE, "M月d日(E)", { locale: ja });
}

// "5月23日 13:11" — month/day plus hours and minutes. Use for snapshots
// like report times, fetch times, or quake occurrence times where the
// year is not load-bearing.
export function formatDateTime(input: Date | string): string {
  const d = toDate(input);
  if (d == null) return typeof input === "string" ? input : "";
  return formatInTimeZone(d, TIMEZONE, "M月d日 HH:mm", { locale: ja });
}

// "2026年5月23日" — full date with year. Use when the year is necessary
// (history listings, audit headers without time).
export function formatFullDate(input: Date | string): string {
  const d = toDate(input);
  if (d == null) return typeof input === "string" ? input : "";
  return formatInTimeZone(d, TIMEZONE, "yyyy年M月d日", { locale: ja });
}

// "2026年5月23日 13:11 JST" — full audit timestamp. Use on /status and
// other operational displays where the timezone has to be explicit.
export function formatAuditDateTime(input: Date | string): string {
  const d = toDate(input);
  if (d == null) return typeof input === "string" ? input : "";
  return `${formatInTimeZone(d, TIMEZONE, "yyyy年M月d日 HH:mm", {
    locale: ja,
  })} JST`;
}

// "2026年5月" — year and month only. Use for month-scoped headers like
// the gomi calendar title.
export function formatYearMonth(input: Date | string): string {
  const d = toDate(input);
  if (d == null) return typeof input === "string" ? input : "";
  return formatInTimeZone(d, TIMEZONE, "yyyy年M月");
}

// "13:11" — wall-clock time only.
export function formatTimeOfDay(input: Date | string): string {
  const d = toDate(input);
  if (d == null) return typeof input === "string" ? input : "";
  return formatInTimeZone(d, TIMEZONE, "HH:mm");
}

// Date-fns locale used by helpers above. Re-exported so call sites that
// genuinely need a one-off format (e.g. `format(date, "yyyy-MM-dd")` for
// HTML <time datetime>) still pin the Japanese locale.
export { ja as datetimeLocale };
