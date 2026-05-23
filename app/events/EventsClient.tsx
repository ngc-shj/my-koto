"use client";

import { useMemo, useState } from "react";
import {
  formatDayWithWeekday,
  formatYearMonth,
} from "@/lib/i18n/datetime";
import type { Event } from "@/lib/events/types";
import { eventsSubscriptionUrl } from "@/lib/ics/url";

// Reusable pure filter so it can be unit-tested without rendering the
// client. Case-folds only ASCII; CJK kanji vary in case-insensitivity
// implementations, so we keep the comparison literal there.
export function filterEvents(events: readonly Event[], query: string): Event[] {
  const q = query.trim();
  if (q.length === 0) return [...events];
  const qLower = q.toLowerCase();
  return events.filter((evt) => {
    const haystack = [
      evt.title,
      evt.location ?? "",
      evt.description ?? "",
      evt.organizer ?? "",
    ];
    return haystack.some((h) =>
      h.includes(q) || h.toLowerCase().includes(qLower),
    );
  });
}

function jstDate(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00+09:00`);
}

type Props = {
  events: Event[];
};

type ViewMode = "list" | "calendar";

// Build Google Calendar "Add event" URL.
function googleCalendarUrl(evt: Event): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: evt.title,
    dates: `${evt.startDate.replace(/-/g, "")}/${(evt.endDate ?? evt.startDate).replace(/-/g, "")}`,
    details: evt.description ?? "",
    location: evt.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Group events by year-month key ("YYYY-MM").
function groupByMonth(events: Event[]): Map<string, Event[]> {
  const map = new Map<string, Event[]>();
  for (const evt of events) {
    const key = evt.startDate.slice(0, 7);
    const list = map.get(key) ?? [];
    list.push(evt);
    map.set(key, list);
  }
  return map;
}

function formatDateRange(evt: Event): string {
  const start = formatDayWithWeekday(jstDate(evt.startDate));
  if (!evt.endDate || evt.endDate === evt.startDate) {
    return start;
  }
  const end = formatDayWithWeekday(jstDate(evt.endDate));
  return `${start} 〜 ${end}`;
}

function MonthLabel({ yearMonth }: { yearMonth: string }) {
  // `yearMonth` is "YYYY-MM"; reconstruct a JST date so the unified
  // formatter renders "YYYY年M月" exactly the same as elsewhere.
  return (
    <h2 className="text-lg font-semibold mt-6 mb-2 border-b pb-1">
      {formatYearMonth(jstDate(`${yearMonth}-01`))}
    </h2>
  );
}

function EventCard({
  evt,
  expanded,
  onToggle,
}: {
  evt: Event;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`border rounded-lg p-4 mb-3 cursor-pointer hover:shadow-md transition-shadow ${
        evt.status === "cancelled" ? "bg-gray-50 opacity-70" : "bg-white"
      }`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onToggle()}
      aria-expanded={expanded}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="font-medium">
            {evt.title}
          </span>
          {evt.status === "cancelled" && (
            <span className="ml-2 inline-block text-xs font-bold text-white bg-red-500 rounded px-1.5 py-0.5">
              中止
            </span>
          )}
          <div className="text-sm text-gray-500 mt-0.5">
            {formatDateRange(evt)}
          </div>
        </div>
        <span className="text-gray-400 text-lg flex-shrink-0">
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 text-sm">
          {evt.location && (
            <p>
              <span className="font-medium text-gray-600">場所: </span>
              {evt.location}
            </p>
          )}
          {evt.description && (
            <p className="text-gray-700 whitespace-pre-line">
              {evt.description}
            </p>
          )}
          {evt.organizer && (
            <p>
              <span className="font-medium text-gray-600">主催: </span>
              {evt.organizer}
            </p>
          )}
          {evt.note && evt.status === "cancelled" && (
            <p className="text-red-600 font-medium">{evt.note}</p>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {evt.url && (
              <a
                href={evt.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-blue-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                詳細ページ
              </a>
            )}
            <a
              href={googleCalendarUrl(evt)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-1 hover:bg-blue-100"
              onClick={(e) => e.stopPropagation()}
            >
              Google カレンダーに追加
            </a>
            <a
              href="/api/ics/events"
              download="koto-events.ics"
              className="inline-block text-sm bg-gray-50 border border-gray-200 text-gray-700 rounded px-2 py-1 hover:bg-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              ICS ダウンロード
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ListView({ events }: { events: Event[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const grouped = groupByMonth(events);

  if (events.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        直近 90 日のイベントはありません。
      </p>
    );
  }

  return (
    <div>
      {Array.from(grouped.entries()).map(([month, monthEvents]) => (
        <div key={month}>
          <MonthLabel yearMonth={month} />
          {monthEvents.map((evt) => (
            <EventCard
              key={evt.id}
              evt={evt}
              expanded={expandedId === evt.id}
              onToggle={() =>
                setExpandedId(expandedId === evt.id ? null : evt.id)
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function CalendarView({ events }: { events: Event[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun

  const eventsInMonth = events.filter((evt) => {
    const start = evt.startDate.slice(0, 7);
    const end = (evt.endDate ?? evt.startDate).slice(0, 7);
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    return start <= key && end >= key;
  });

  const prevMonth = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  };
  const nextMonth = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  };

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="px-3 py-1 rounded border hover:bg-gray-100"
          aria-label="前の月"
        >
          ‹
        </button>
        <span className="font-semibold">
          {formatYearMonth(new Date(year, month, 1))}
        </span>
        <button
          onClick={nextMonth}
          className="px-3 py-1 rounded border hover:bg-gray-100"
          aria-label="次の月"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded overflow-hidden">
        {weekdays.map((d) => (
          <div
            key={d}
            className="bg-gray-100 text-center text-xs font-medium py-1"
          >
            {d}
          </div>
        ))}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-white min-h-[60px]" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = eventsInMonth.filter(
            (evt) =>
              evt.startDate <= dateStr &&
              (evt.endDate ?? evt.startDate) >= dateStr,
          );
          const isToday =
            today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === day;

          return (
            <div
              key={day}
              className={`bg-white min-h-[60px] p-1 text-xs ${isToday ? "ring-2 ring-inset ring-blue-400" : ""}`}
            >
              <span
                className={`block text-right font-medium mb-1 ${isToday ? "text-blue-600" : ""}`}
              >
                {day}
              </span>
              {dayEvents.map((evt) => (
                <span
                  key={evt.id}
                  className={`block truncate rounded px-1 mb-0.5 ${
                    evt.status === "cancelled"
                      ? "bg-gray-200 text-gray-500 line-through"
                      : "bg-blue-100 text-blue-800"
                  }`}
                  title={evt.title}
                >
                  {evt.title}
                </span>
              ))}
            </div>
          );
        })}
      </div>

      {eventsInMonth.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-medium text-gray-600">
            この月のイベント
          </h3>
          {eventsInMonth.map((evt) => (
            <div key={evt.id} className="text-sm border rounded p-2">
              <span className="font-medium">{evt.title}</span>
              {evt.status === "cancelled" && (
                <span className="ml-1 text-xs font-bold text-red-500">
                  [中止]
                </span>
              )}
              <span className="ml-2 text-gray-500">
                {formatDateRange(evt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EventsClient({ events }: Props) {
  const [view, setView] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const filteredEvents = useMemo(
    () => filterEvents(events, query),
    [events, query],
  );
  const trimmed = query.trim();

  async function handleCopySubscribeUrl() {
    const ua =
      typeof navigator !== "undefined" ? navigator.userAgent : "";
    const host =
      typeof window !== "undefined" ? window.location.host : "localhost";
    const url = eventsSubscriptionUrl(host, ua);
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <label className="block">
          <span className="sr-only">イベントを検索</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="タイトル・場所・主催で検索"
            autoComplete="off"
            enterKeyHint="search"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        {trimmed.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            {filteredEvents.length} 件が一致
            {filteredEvents.length === 0 && " — 別のキーワードをお試しください。"}
          </p>
        )}
      </div>

      {/* View switcher and actions */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded border overflow-hidden">
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 text-sm ${
              view === "list"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            aria-pressed={view === "list"}
          >
            リスト
          </button>
          <button
            onClick={() => setView("calendar")}
            className={`px-3 py-1.5 text-sm border-l ${
              view === "calendar"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            aria-pressed={view === "calendar"}
          >
            カレンダー
          </button>
        </div>

        <a
          href="/api/ics/events"
          download="koto-events.ics"
          className="text-sm bg-gray-100 border border-gray-300 text-gray-700 rounded px-3 py-1.5 hover:bg-gray-200"
        >
          ICS ダウンロード
        </a>

        <button
          onClick={handleCopySubscribeUrl}
          className="text-sm bg-gray-100 border border-gray-300 text-gray-700 rounded px-3 py-1.5 hover:bg-gray-200"
        >
          {copyStatus === "copied"
            ? "コピーしました！"
            : copyStatus === "error"
              ? "コピー失敗"
              : "購読 URL をコピー"}
        </button>
      </div>

      {/* View content */}
      {view === "list" ? (
        <ListView events={filteredEvents} />
      ) : (
        <CalendarView events={filteredEvents} />
      )}
    </div>
  );
}
