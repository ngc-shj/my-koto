"use client";

import { useEffect, useState } from "react";
import {
  getFuriganaEnabled,
  setFuriganaEnabled,
  subscribeFuriganaChange,
} from "@/lib/a11y/preferences";

// Standalone settings panel for accessibility-style preferences. Currently
// just the furigana toggle; sized as a section so future entries (text
// scaling, reduced motion) can land here without a redesign.
export default function A11ySettings() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(getFuriganaEnabled());
    return subscribeFuriganaChange(setEnabled);
  }, []);

  function handleToggle() {
    const next = !enabled;
    setFuriganaEnabled(next);
    // Optimistic local state update — the subscription above will fire
    // and confirm, but updating immediately keeps the toggle responsive.
    setEnabled(next);
  }

  return (
    <section className="space-y-3 border-t border-gray-200 pt-6">
      <h2 className="text-lg font-semibold text-gray-800">表示設定</h2>
      <div className="flex items-start gap-3">
        <label className="flex items-start gap-2 cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={enabled}
            onChange={handleToggle}
            className="mt-1"
            aria-label="ふりがなを表示する"
          />
          <span className="text-sm text-gray-700">
            <span className="block font-medium text-gray-900">
              ふりがなを表示する
            </span>
            <span className="block text-xs text-gray-500">
              地区名などにふりがな (ルビ) を表示します。日本語学習中の方や
              漢字に不慣れな方の補助に利用できます。
            </span>
            <span className="mt-1 inline-block">
              <ruby>
                例
                <rt>れい</rt>
              </ruby>
              :{" "}
              <ruby>
                亀戸
                <rt>かめいど</rt>
              </ruby>
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}
