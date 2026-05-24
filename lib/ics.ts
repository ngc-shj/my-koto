import ical, {
  ICalCalendar,
  ICalEventStatus,
  escape,
  foldLines,
} from "ical-generator";
import { getVtimezoneComponent } from "@touch4it/ical-timezones";
import { TIMEZONE } from "@/config/geo";
import type { Event } from "@/lib/events/types";
import type { District, GomiOccurrence } from "@/lib/gomi/types";
import { GOMI_CATEGORY_LABELS } from "@/lib/gomi/types";

export type IcsDeps = {
  now: () => Date;
  uuid: () => string;
};

const DEFAULT_DEPS: IcsDeps = {
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
};

// Build a base ICalCalendar with VTIMEZONE for Asia/Tokyo.
function buildCalendar(name: string): ICalCalendar {
  const cal = ical({ name });
  cal.timezone({ name: TIMEZONE, generator: getVtimezoneComponent });
  return cal;
}

// Insert COMMENT lines before each END:VEVENT, keyed by UID.
// Uses ical-generator's escape() to prevent iCalendar injection.
function insertComments(
  ics: string,
  comments: ReadonlyMap<string, string>,
): string {
  if (comments.size === 0) return ics;

  const lines = ics.split("\r\n");
  const result: string[] = [];
  let currentUid: string | null = null;

  for (const line of lines) {
    if (line.startsWith("UID:")) {
      currentUid = line.slice(4);
    }

    if (line === "END:VEVENT" && currentUid) {
      const comment = comments.get(currentUid);
      if (comment) {
        const escaped = escape(comment, false);
        const folded = foldLines("COMMENT:" + escaped);
        // foldLines may return multi-line folded content (CRLF separated).
        result.push(...folded.split("\r\n"));
      }
    }

    result.push(line);
  }

  return result.join("\r\n");
}

// Determine safe URL: https only, undefined otherwise.
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build a VCALENDAR ICS string from application Event objects.
 *
 * - VTIMEZONE for Asia/Tokyo is included.
 * - STATUS:CANCELLED is emitted for events with status === 'cancelled'.
 * - Text fields (SUMMARY, DESCRIPTION, LOCATION, CATEGORIES) are escaped
 *   by ical-generator; COMMENT is escaped manually and inserted via
 *   insertComments().
 * - URL is included only for https: scheme URLs.
 * - UID is deterministic: "<event-id>@my-koto.example".
 * - DTSTAMP is derived from deps.now() for testability.
 */
export function buildEventIcs(events: readonly Event[], deps?: IcsDeps): string {
  const { now } = { ...DEFAULT_DEPS, ...deps };
  const stamp = now();

  const cal = buildCalendar("江東区イベント");
  cal.prodId({
    company: "my-koto",
    product: "event-calendar",
    language: "JA",
  });

  const comments = new Map<string, string>();

  for (const evt of events) {
    const uid = `${evt.id}@my-koto.example`;
    const [startY, startM, startD] = evt.startDate.split("-").map(Number);
    const endDate = evt.endDate ?? evt.startDate;
    const [endY, endM, endD] = endDate.split("-").map(Number);

    // Build all-day dates in JST (midnight local time).
    const startDt = new Date(Date.UTC(startY, startM - 1, startD));
    // RFC 5545: DTEND for DATE-type is exclusive, so add 1 day.
    const endDt = new Date(Date.UTC(endY, endM - 1, endD + 1));

    const event = cal.createEvent({
      id: uid,
      start: startDt,
      end: endDt,
      allDay: true,
      summary: evt.title,
      description: evt.description,
      location: evt.location,
      stamp,
      status:
        evt.status === "cancelled"
          ? ICalEventStatus.CANCELLED
          : ICalEventStatus.CONFIRMED,
      url: safeUrl(evt.url),
      timezone: TIMEZONE,
    });

    // Suppress unused variable warning — event is used for side effects.
    void event;

    if (evt.note) {
      comments.set(uid, evt.note);
    }
  }

  return insertComments(cal.toString(), comments);
}

/**
 * Build a VCALENDAR ICS string for a district's garbage collection schedule.
 *
 * - VTIMEZONE for Asia/Tokyo is included.
 * - UID is deterministic: "<district-id>-<date>@my-koto.example".
 * - CATEGORIES lists the Japanese waste category labels.
 * - DTSTAMP is derived from deps.now() for testability.
 */
export function buildGomiIcs(
  district: District,
  occurrences: readonly GomiOccurrence[],
  deps?: IcsDeps,
): string {
  const { now } = { ...DEFAULT_DEPS, ...deps };
  const stamp = now();

  const cal = buildCalendar(`ごみ収集カレンダー (${district.label})`);
  cal.prodId({
    company: "my-koto",
    product: "gomi-calendar",
    language: "JA",
  });

  for (const occ of occurrences) {
    const dateStr = occ.date.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const uid = `${district.id}-${dateStr}@my-koto.example`;
    const labels = occ.categories.map((c) => GOMI_CATEGORY_LABELS[c]);
    const summary = labels.join("・");

    // All-day event in JST date.
    const [y, m, d] = dateStr.split("-").map(Number);
    const startDt = new Date(Date.UTC(y, m - 1, d));
    const endDt = new Date(Date.UTC(y, m - 1, d + 1));

    const event = cal.createEvent({
      id: uid,
      start: startDt,
      end: endDt,
      allDay: true,
      summary,
      stamp,
      timezone: TIMEZONE,
    });

    for (const label of labels) {
      event.createCategory({ name: label });
    }
  }

  return cal.toString();
}
