"use client";

import { useState, useEffect, useMemo } from "react";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  isTomorrow,
  isSameDay,
} from "date-fns";
import { ja } from "date-fns/locale";
import DistrictSelector from "@/components/DistrictSelector";
import SubscribeButton from "@/components/SubscribeButton";
import { getDistrictId } from "@/config/storage";
import { resolveSchedule } from "@/lib/gomi/schedule";
import { GOMI_CATEGORY_LABELS } from "@/lib/gomi/types";
import type { District, SpecialOverlay, GomiOccurrence } from "@/lib/gomi/types";

type Props = {
  districts: District[];
  overlays: SpecialOverlay[];
};

const CATEGORY_COLORS: Record<string, string> = {
  burnable: "bg-red-100 text-red-800",
  non_burnable: "bg-blue-100 text-blue-800",
  resource_plastic: "bg-green-100 text-green-800",
  container_plastic: "bg-teal-100 text-teal-800",
  pet_bottle: "bg-yellow-100 text-yellow-800",
  bottles_cans: "bg-purple-100 text-purple-800",
  bulky: "bg-gray-100 text-gray-800",
};

export default function GomiPageClient({ districts, overlays }: Props) {
  const [districtId, setDistrictIdState] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [today] = useState(() => new Date());

  useEffect(() => {
    const stored = getDistrictId();
    if (stored) {
      setDistrictIdState(stored);
    } else {
      setSelectorOpen(true);
    }
  }, []);

  const district = useMemo(
    () => districts.find((d) => d.id === districtId) ?? null,
    [districts, districtId],
  );

  const weekOccurrences = useMemo((): GomiOccurrence[] => {
    if (!district) return [];
    const from = startOfWeek(today, { weekStartsOn: 1 });
    const to = endOfWeek(today, { weekStartsOn: 1 });
    return resolveSchedule(district, overlays, { from, to });
  }, [district, overlays, today]);

  const monthOccurrences = useMemo((): GomiOccurrence[] => {
    if (!district) return [];
    const from = startOfMonth(today);
    const to = endOfMonth(today);
    return resolveSchedule(district, overlays, { from, to });
  }, [district, overlays, today]);

  const todayOccurrence = useMemo(
    () => weekOccurrences.find((o) => isToday(o.date)) ?? null,
    [weekOccurrences],
  );

  const tomorrowOccurrence = useMemo(
    () => weekOccurrences.find((o) => isTomorrow(o.date)) ?? null,
    [weekOccurrences],
  );

  function renderCategories(occ: GomiOccurrence | null) {
    if (!occ || occ.categories.length === 0) {
      return <span className="text-gray-500 text-sm">収集なし</span>;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {occ.categories.map((cat) => (
          <span
            key={cat}
            className={`px-2 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-800"}`}
          >
            {GOMI_CATEGORY_LABELS[cat]}
          </span>
        ))}
      </div>
    );
  }

  const monthDays = eachDayOfInterval({
    start: startOfMonth(today),
    end: endOfMonth(today),
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">ごみ収集カレンダー</h1>
        {district && (
          <button
            type="button"
            onClick={() => setSelectorOpen(true)}
            className="text-sm text-blue-600 underline hover:text-blue-800"
          >
            地区変更
          </button>
        )}
      </div>

      {!districtId && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-blue-800 font-medium">
            お住まいの地区を選択してください
          </p>
          <button
            type="button"
            onClick={() => setSelectorOpen(true)}
            className="shrink-0 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            地区を選択
          </button>
        </div>
      )}

      {district && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            選択中の地区:{" "}
            <span className="font-semibold text-gray-900">{district.label}</span>
          </p>
          {district.notes && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠ {district.notes} (現状の表示は毎週として扱っています — 公式サイトの隔週日程を最終確認してください)
            </p>
          )}
          <SubscribeButton districtId={district.id} />
        </div>
      )}

      {/* Today / Tomorrow */}
      {district && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">当日・翌日</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                今日 ({format(today, "M/d（E）", { locale: ja })})
              </p>
              {renderCategories(todayOccurrence)}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                明日 ({format(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1), "M/d（E）", { locale: ja })})
              </p>
              {renderCategories(tomorrowOccurrence)}
            </div>
          </div>
        </section>
      )}

      {/* Weekly view */}
      {district && weekOccurrences.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">今週の収集</h2>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
            {weekOccurrences.map((occ) => (
              <div key={occ.date.toISOString()} className="flex items-center gap-4 px-4 py-3 bg-white">
                <span className="w-24 shrink-0 text-sm text-gray-600">
                  {format(occ.date, "M/d（E）", { locale: ja })}
                </span>
                <div className="flex flex-wrap gap-2">
                  {occ.categories.map((cat) => (
                    <span
                      key={cat}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-800"}`}
                    >
                      {GOMI_CATEGORY_LABELS[cat]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Monthly calendar */}
      {district && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">
            {format(today, "yyyy年M月", { locale: ja })}の収集カレンダー
          </h2>
          <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden text-center text-xs">
            {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
              <div key={d} className="bg-gray-50 py-2 font-medium text-gray-600">
                {d}
              </div>
            ))}
            {/* Leading empty cells for month start offset */}
            {Array.from({
              length:
                ((startOfMonth(today).getDay() + 6) % 7),
            }).map((_, i) => (
              <div key={`pad-${i}`} className="bg-white py-2" />
            ))}
            {monthDays.map((day) => {
              const occ = monthOccurrences.find((o) => isSameDay(o.date, day));
              const isCurrentDay = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`bg-white py-1 px-0.5 min-h-12 flex flex-col items-center gap-0.5 ${isCurrentDay ? "ring-2 ring-blue-500 ring-inset" : ""}`}
                >
                  <span className={`text-xs ${isCurrentDay ? "font-bold text-blue-600" : "text-gray-700"}`}>
                    {format(day, "d")}
                  </span>
                  {occ?.categories.map((cat) => (
                    <span
                      key={cat}
                      className={`w-full text-center rounded px-0.5 text-[9px] leading-tight ${CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-800"}`}
                    >
                      {GOMI_CATEGORY_LABELS[cat].slice(0, 4)}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <DistrictSelector
        open={selectorOpen}
        onSelect={(id) => setDistrictIdState(id)}
        onClose={() => setSelectorOpen(false)}
      />
    </div>
  );
}
