"use client";

import { useState, useEffect } from "react";
import districts from "@/data/districts.json";
import { setDistrictId, getDistrictId } from "@/config/storage";

type Props = {
  // Called when the user confirms a district selection.
  onSelect: (districtId: string) => void;
  // Whether the modal is shown.
  open: boolean;
  onClose: () => void;
};

export default function DistrictSelector({ onSelect, open, onClose }: Props) {
  const [selected, setSelected] = useState<string>(() => getDistrictId() ?? "");

  useEffect(() => {
    // Sync with storage in case it was changed externally.
    setSelected(getDistrictId() ?? "");
  }, [open]);

  function handleConfirm() {
    if (!selected) return;
    setDistrictId(selected);
    onSelect(selected);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="district-selector-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
        <h2
          id="district-selector-title"
          className="text-lg font-semibold text-gray-900"
        >
          お住まいの地区を選択
        </h2>
        <p className="text-sm text-gray-600">
          選択した地区のごみ収集スケジュールを表示します。
        </p>
        <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {districts.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelected(d.id)}
              className={[
                "w-full text-left px-4 py-3 text-sm transition-colors",
                selected === d.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "hover:bg-gray-50 text-gray-800",
              ].join(" ")}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3 justify-end pt-2">
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
            この地区に設定
          </button>
        </div>
      </div>
    </div>
  );
}
