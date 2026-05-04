// Anchor calendar for Koto-ku's 12 biweekly 燃やさないごみ collection routes.
//
// Source: https://www.city.koto.lg.jp/388010/kurashi/gomi/kate/43735.html
// Each area code (1..12) has a single anchor date in the published calendar
// image. The collection recurs every 14 days from that anchor for the rest
// of the fiscal year. The resolver derives the actual collection dates by
// computing `(date - anchor) % 14 === 0`.
//
// Year discipline:
// - The published calendar runs April 2026 → March 2027 (FY2026).
// - The 14-day cycle is preserved across the fiscal-year boundary by the
//   official site too, so the modulo math is sound for any date once we
//   pin the anchor inside the cycle.
// - When FY2027's calendar is published (~ March 2027), refresh the
//   anchor dates here. Tracked in koto-mvp-deviation.md.
import type { Weekday } from "./types";

export type BiweeklyAnchor = {
  readonly weekday: Weekday;
  // ISO date string (yyyy-mm-dd) of one known collection date. All other
  // dates in the cycle are this anchor + 14n days.
  readonly anchorDate: string;
};

export const BIWEEKLY_ANCHORS: Readonly<Record<number, BiweeklyAnchor>> = {
  1: { weekday: "mon", anchorDate: "2026-04-06" },
  2: { weekday: "tue", anchorDate: "2026-04-07" },
  3: { weekday: "wed", anchorDate: "2026-04-08" },
  4: { weekday: "thu", anchorDate: "2026-04-09" },
  5: { weekday: "fri", anchorDate: "2026-04-10" },
  6: { weekday: "sat", anchorDate: "2026-04-11" },
  7: { weekday: "mon", anchorDate: "2026-04-13" },
  8: { weekday: "tue", anchorDate: "2026-04-14" },
  9: { weekday: "wed", anchorDate: "2026-04-01" },
  10: { weekday: "thu", anchorDate: "2026-04-02" },
  11: { weekday: "fri", anchorDate: "2026-04-03" },
  12: { weekday: "sat", anchorDate: "2026-04-04" },
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Returns true if `date` is a collection day for the given area code, i.e.
// it falls on the anchor's weekday AND lies on a 14-day boundary from the
// anchor. Both `date` and the anchor are interpreted in local time at
// midnight; we never cross a TZ boundary because Koto-ku is single-TZ.
export function isBiweeklyCollectionDate(
  areaCode: number,
  date: Date,
): boolean {
  const anchor = BIWEEKLY_ANCHORS[areaCode];
  if (!anchor) return false;
  const [y, m, d] = anchor.anchorDate.split("-").map((s) => Number.parseInt(s, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return false;
  }
  const anchorMidnight = new Date(y, m - 1, d).getTime();
  const dateMidnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  const diffDays = Math.round((dateMidnight - anchorMidnight) / ONE_DAY_MS);
  return diffDays % 14 === 0;
}
