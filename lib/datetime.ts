import { format, toZonedTime } from "date-fns-tz";
import { TIMEZONE } from "@/config/geo";

// Returns the current time as a Date object adjusted to Asia/Tokyo zone
export function nowJst(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

// Formats a Date in Asia/Tokyo timezone using the given format string
export function formatJst(date: Date, fmt: string): string {
  return format(toZonedTime(date, TIMEZONE), fmt, { timeZone: TIMEZONE });
}

// Formats a date as "YYYY-MM-DD HH:mm JST"
export function formatJstFull(date: Date): string {
  return formatJst(date, "yyyy-MM-dd HH:mm") + " JST";
}

// Formats a date as "YYYY-MM-DD"
export function formatJstDate(date: Date): string {
  return formatJst(date, "yyyy-MM-dd");
}
