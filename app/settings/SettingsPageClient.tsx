"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DistrictSelector from "@/components/DistrictSelector";
import {
  getDistrictId,
  clearAllStorage,
} from "@/config/storage";
import districts from "@/data/districts.json";

export default function SettingsPageClient() {
  const router = useRouter();
  const [districtId, setDistrictIdState] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    setDistrictIdState(getDistrictId());
  }, []);

  const districtLabel =
    districts.find((d) => d.id === districtId)?.label ?? null;

  function handleClearStorage() {
    clearAllStorage();
    setDistrictIdState(null);
    setCleared(true);
  }

  function handleDistrictSelected(id: string) {
    setDistrictIdState(id);
    setCleared(false);
    router.push("/gomi");
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">設定</h1>

      {/* District setting */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-800">ごみ収集地区</h2>
        <p className="text-sm text-gray-600">
          現在の地区:{" "}
          {districtLabel ? (
            <span className="font-semibold text-gray-900">{districtLabel}</span>
          ) : (
            <span className="text-gray-500">未設定</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setSelectorOpen(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          地区を変更する
        </button>
      </section>

      {/* Privacy / storage */}
      <section className="space-y-3 border-t border-gray-200 pt-6">
        <h2 className="text-lg font-semibold text-gray-800">プライバシー</h2>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>このサイトは Cookie を使用しません。</li>
          <li>
            設定（選択地区・表示テーマ）はお使いのデバイスの LocalStorage
            にのみ保存されます。
          </li>
          <li>行動追跡・外部サービスへのデータ送信は行いません。</li>
        </ul>
        <div className="pt-2">
          <button
            type="button"
            onClick={handleClearStorage}
            className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            LocalStorage を消去する
          </button>
          {cleared && (
            <p className="mt-2 text-sm text-green-700">
              LocalStorage を消去しました。
            </p>
          )}
        </div>
      </section>

      <DistrictSelector
        open={selectorOpen}
        onSelect={handleDistrictSelected}
        onClose={() => setSelectorOpen(false)}
      />
    </div>
  );
}
