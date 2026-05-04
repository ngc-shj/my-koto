"use client";

import { useState, useEffect } from "react";
import ProfileManager from "@/components/ProfileManager";
import PushOptIn from "@/components/PushOptIn";
import { clearAllStorage } from "@/config/storage";
import { getActiveDistrictId, type Profile } from "@/lib/profiles";

export default function SettingsPageClient() {
  const [activeDistrictId, setActiveDistrictId] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    setActiveDistrictId(getActiveDistrictId());
  }, []);

  function handleClearStorage() {
    clearAllStorage();
    setActiveDistrictId(null);
    setCleared(true);
  }

  function handleProfileChange(active: Profile | null) {
    setActiveDistrictId(active?.districtId ?? null);
    setCleared(false);
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">設定</h1>

      <ProfileManager onChange={handleProfileChange} />

      <PushOptIn districtId={activeDistrictId} />

      <section className="space-y-3 border-t border-gray-200 pt-6">
        <h2 className="text-lg font-semibold text-gray-800">プライバシー</h2>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>このサイトは Cookie を使用しません。</li>
          <li>
            設定（プロファイル・表示テーマ）はお使いのデバイスの LocalStorage
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
    </div>
  );
}
