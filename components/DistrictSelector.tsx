"use client";

import { useState, useEffect, useMemo } from "react";
import districts from "@/data/districts.json";
import type { District } from "@/lib/gomi/types";
import { AREA_LABELS } from "@/lib/gomi/types";
import { normalize } from "@/lib/search/normalize";

type Props = {
  onSelect: (districtId: string) => void;
  open: boolean;
  onClose: () => void;
  // Pre-selected district id when reopening the picker for an existing
  // profile. Defaults to no selection so the confirm button stays disabled
  // until the user picks a row.
  initialDistrictId?: string | null;
  // Override the confirm button label so the picker can read naturally for
  // either "set as active" or "save into profile" callers.
  confirmLabel?: string;
};

const ALL_DISTRICTS = districts as District[];

// Buckets districts by their area label so the dropdown stays readable
// even with 50+ entries.
type Group = { area: District["area"]; items: District[] };

function groupByArea(items: District[]): Group[] {
  const buckets = new Map<District["area"], District[]>();
  for (const d of items) {
    const key = d.area ?? "fukagawa";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(d);
  }
  return Array.from(buckets.entries()).map(([area, group]) => ({ area, items: group }));
}

export default function DistrictSelector({
  onSelect,
  open,
  onClose,
  initialDistrictId,
  confirmLabel = "この地区に設定",
}: Props) {
  const [selected, setSelected] = useState<string>(initialDistrictId ?? "");
  const [query, setQuery] = useState("");

  // Re-seed selection from the prop each time the modal opens, so the
  // picker reflects whichever profile (or none) the caller is editing.
  useEffect(() => {
    setSelected(initialDistrictId ?? "");
    if (open) setQuery("");
  }, [open, initialDistrictId]);

  const groups = useMemo<Group[]>(() => {
    const q = query.trim();
    if (!q) return groupByArea(ALL_DISTRICTS);
    const normalizedQuery = normalize(q);
    const filtered = ALL_DISTRICTS.filter((d) => {
      // Match against label, reading and address aliases simultaneously.
      const haystack = [
        d.label,
        d.reading ?? "",
        ...(d.addresses ?? []),
      ]
        .map(normalize)
        .join(" ");
      return haystack.includes(normalizedQuery);
    });
    return groupByArea(filtered);
  }, [query]);

  const totalMatches = useMemo(
    () => groups.reduce((sum, g) => sum + g.items.length, 0),
    [groups],
  );

  function handleConfirm() {
    if (!selected) return;
    // Persistence is the caller's responsibility — for the multi-profile
    // flow we may be saving the selection into a not-yet-active profile
    // rather than pinning it as the global active district.
    onSelect(selected);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="district-selector-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]">
        <div className="px-6 pt-6 pb-3 space-y-3">
          <h2
            id="district-selector-title"
            className="text-lg font-semibold text-gray-900"
          >
            お住まいの地区を選択
          </h2>
          <p className="text-sm text-gray-600">
            選択した地区のごみ収集スケジュールを表示します。「亀戸」「ひらの」「toyosu」のように漢字・かな・ローマ字いずれでも検索できます。
          </p>
          <div>
            <label htmlFor="district-search" className="sr-only">
              地区を検索
            </label>
            <input
              id="district-search"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例: 亀戸、ひらの、toyosu"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              {totalMatches}件 / 全 {ALL_DISTRICTS.length} 地区
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto border-t border-b border-gray-200 divide-y divide-gray-100">
          {groups.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">
              該当する地区が見つかりません。
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.area ?? "unknown"}>
                {group.area && (
                  <div className="px-4 py-1.5 bg-gray-50 text-xs font-semibold text-gray-600 sticky top-0">
                    {AREA_LABELS[group.area]}
                  </div>
                )}
                {group.items.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelected(d.id)}
                    className={[
                      "w-full text-left px-4 py-3 text-sm transition-colors flex flex-col gap-0.5",
                      selected === d.id
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "hover:bg-gray-50 text-gray-800",
                    ].join(" ")}
                  >
                    <span>{d.label}</span>
                    {d.reading && (
                      <span className="text-xs text-gray-500">{d.reading}</span>
                    )}
                  </button>
                ))}
              </section>
            ))
          )}
        </div>
        <div className="flex gap-3 justify-end px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
