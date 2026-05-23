"use client";

import { useState } from "react";
import { saveGeolocationConsent } from "@/lib/geolocation-consent";

type GeolocationConsentProps = {
  onConsent: (position: GeolocationPosition) => void;
  onDeny: () => void;
};

// Pre-browser-prompt consent modal: explains purpose before requesting Geolocation.
// Coordinates themselves are used only in-scope (never stored or sent to
// external APIs); the visitor's allow/deny choice is persisted so the
// modal doesn't re-ask on every page load.
export default function GeolocationConsent({ onConsent, onDeny }: GeolocationConsentProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAllow() {
    setIsRequesting(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsRequesting(false);
        saveGeolocationConsent("granted");
        onConsent(position);
      },
      () => {
        setIsRequesting(false);
        setError("位置情報の取得に失敗しました。");
        // Browser-level denial is recorded as denied too so we don't
        // re-prompt every visit; visitor can re-enable from /settings.
        saveGeolocationConsent("denied");
        onDeny();
      }
    );
  }

  function handleDeny() {
    saveGeolocationConsent("denied");
    onDeny();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="geolocation-title"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div className="bg-white rounded-lg max-w-sm w-full p-6 space-y-4">
        <h2 id="geolocation-title" className="text-lg font-semibold">
          現在地の利用について
        </h2>
        <div className="text-sm text-gray-700 space-y-2">
          <p>近くの AED・公衆トイレなどを表示するために、現在地を使用します。</p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>座標は端末内のみで処理し、外部サーバーへ送信しません</li>
            <li>座標自体は Cookie・LocalStorage に保存しません</li>
            <li>選択(許可/不許可)は次回以降にも適用されます (設定画面でリセットできます)</li>
          </ul>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleAllow}
            disabled={isRequesting}
            className="flex-1 px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {isRequesting ? "取得中..." : "許可する"}
          </button>
          <button
            onClick={handleDeny}
            disabled={isRequesting}
            className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            使用しない
          </button>
        </div>
      </div>
    </div>
  );
}
