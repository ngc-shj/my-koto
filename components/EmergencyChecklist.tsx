"use client";

import { useEffect, useMemo, useState } from "react";
import { KanjiText } from "@/components/Furigana";
import { EMERGENCY_CHECKLIST } from "@/config/disaster-guide";
import {
  loadCheckedItems,
  saveCheckedItems,
} from "@/lib/disaster/checklist-storage";

// Tickable備蓄/非常持ち出し品 checklist with progress persisted to
// localStorage. Hydration-safe: starts empty on the server, fills from
// storage after mount so SSR markup matches the first client render.
export default function EmergencyChecklist() {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setChecked(loadCheckedItems());
    setHydrated(true);
  }, []);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCheckedItems(next);
      return next;
    });
  }

  function reset() {
    const empty = new Set<string>();
    setChecked(empty);
    saveCheckedItems(empty);
  }

  const total = useMemo(
    () => EMERGENCY_CHECKLIST.reduce((n, g) => n + g.items.length, 0),
    [],
  );
  const doneCount = checked.size;

  return (
    <section className="space-y-4" aria-labelledby="checklist-heading">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 id="checklist-heading" className="text-lg font-semibold">
          <KanjiText text="非常持ち出し品・備蓄チェックリスト" />
        </h2>
        {hydrated && doneCount > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            <KanjiText text="チェックをリセット" />
          </button>
        )}
      </div>

      {hydrated && (
        <p className="text-sm text-gray-600" aria-live="polite">
          {doneCount} / {total} <KanjiText text="項目チェック済み" />
        </p>
      )}

      {EMERGENCY_CHECKLIST.map((group) => (
        <fieldset key={group.id} className="space-y-2">
          <legend className="text-sm font-semibold text-gray-700">
            <KanjiText text={group.title} />
          </legend>
          <ul className="space-y-1.5">
            {group.items.map((item) => {
              const isChecked = checked.has(item.id);
              return (
                <li key={item.id}>
                  <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(item.id)}
                      className="mt-0.5 accent-emerald-600"
                    />
                    <span className={isChecked ? "line-through text-gray-400" : ""}>
                      <KanjiText text={item.label} />
                      {item.note && (
                        <span className="block text-xs text-gray-500">
                          <KanjiText text={item.note} />
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </section>
  );
}
