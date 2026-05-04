"use client";

import { useState } from "react";

type GeolocationConsentProps = {
  onConsent: (position: GeolocationPosition) => void;
  onDeny: () => void;
};

// Pre-browser-prompt consent modal: explains purpose before requesting Geolocation.
// Coordinates are used only in-scope (never stored or sent to external APIs).
export default function GeolocationConsent({ onConsent, onDeny }: GeolocationConsentProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAllow() {
    setIsRequesting(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsRequesting(false);
        onConsent(position);
      },
      () => {
        setIsRequesting(false);
        setError("位置情報の取得に失敗しました。");
        onDeny();
      }
    );
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
          <p>近くの AED・公衆トイレを表示するために、現在地を使用します。</p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>位置情報は端末内のみで処理されます</li>
            <li>外部サーバーへの送信は行いません</li>
            <li>Cookie・LocalStorage への保存は行いません</li>
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
            onClick={onDeny}
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
