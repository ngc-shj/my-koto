"use client";

import { useState, useEffect } from "react";
import A11ySettings from "@/components/A11ySettings";
import ProfileManager from "@/components/ProfileManager";
import PushOptIn from "@/components/PushOptIn";
import { clearAllStorage } from "@/config/storage";
import { clearGeolocationConsent } from "@/lib/geolocation-consent";
import { clearBusCache } from "@/lib/map/bus-cache";
import { clearMapFilters } from "@/lib/map/filters-storage";
import { clearCachedPois } from "@/lib/map/poi-cache";
import { getActiveDistrictId, type Profile } from "@/lib/profiles";

export default function SettingsPageClient() {
  const [activeDistrictId, setActiveDistrictId] = useState<string | null>(null);
  // Per-row "消去しました" hint. Keyed by row id so flashing one
  // doesn't dismiss another visitor just toggled.
  const [clearedRow, setClearedRow] = useState<string | null>(null);

  useEffect(() => {
    setActiveDistrictId(getActiveDistrictId());
  }, []);

  function handleProfileChange(active: Profile | null) {
    setActiveDistrictId(active?.districtId ?? null);
  }

  function flash(id: string) {
    setClearedRow(id);
    window.setTimeout(() => {
      setClearedRow((prev) => (prev === id ? null : prev));
    }, 2000);
  }

  function handleClearGeolocation() {
    clearGeolocationConsent();
    flash("geolocation");
  }

  function handleClearMapPrefs() {
    clearMapFilters();
    clearCachedPois();
    void clearBusCache();
    flash("map");
  }

  function handleClearProfilesAndPrefs() {
    clearAllStorage();
    setActiveDistrictId(null);
    flash("all");
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">設定</h1>

      <ProfileManager onChange={handleProfileChange} />

      <PushOptIn districtId={activeDistrictId} />

      <A11ySettings />

      <section className="space-y-4 border-t border-gray-200 pt-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">プライバシー</h2>
          <ul className="mt-2 text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>このサイトは Cookie を使用しません。</li>
            <li>
              設定・キャッシュは端末の LocalStorage / IndexedDB にのみ保存されます。
            </li>
            <li>行動追跡・外部サービスへのデータ送信は行いません。</li>
          </ul>
        </div>

        <div className="space-y-3">
          <ResetRow
            title="現在地の利用許可"
            description="区民マップ・防災マップで「許可する／使用しない」の選択を初期化します。次回アクセス時にダイアログが再度表示されます。"
            onReset={handleClearGeolocation}
            flashed={clearedRow === "geolocation"}
          />
          <ResetRow
            title="区民マップの設定とキャッシュ"
            description="レイヤ選択、表示中の周辺データ、バス停バンドル(IndexedDB)を消去します。次回アクセス時に再取得されます。"
            onReset={handleClearMapPrefs}
            flashed={clearedRow === "map"}
          />
          <ResetRow
            title="プロファイル・テーマ設定"
            description="登録した地区プロファイルと表示テーマを消去します。"
            onReset={handleClearProfilesAndPrefs}
            flashed={clearedRow === "all"}
          />
        </div>
      </section>
    </div>
  );
}

function ResetRow({
  title,
  description,
  onReset,
  flashed,
}: {
  title: string;
  description: string;
  onReset: () => void;
  flashed: boolean;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        <p className="mt-0.5 text-xs text-gray-600">{description}</p>
        {flashed && (
          <p className="mt-1 text-xs text-green-700">消去しました</p>
        )}
      </div>
      <button
        type="button"
        onClick={onReset}
        aria-label={`${title} を消去`}
        className="text-xs px-3 py-1.5 font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors flex-shrink-0"
      >
        消去
      </button>
    </div>
  );
}
