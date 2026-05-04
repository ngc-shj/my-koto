"use client";

import { useEffect, useState } from "react";
import { gomiSubscriptionUrl } from "@/lib/ics/url";

type Props = {
  // Validated district id (must match the API allowlist).
  districtId: string;
};

// Renders both an "Open in Calendar" link (UA-judged webcal:// or https://)
// and a "Copy URL" button so users on every platform can subscribe to the
// gomi calendar feed without leaving the page. F-02 wires this into the UI
// to satisfy Plan F19 — clipboard copies the webcal:// form on iOS so the
// user can paste it into a sibling device's calendar app.
//
// SSR caveat (F-13): the URL depends on `window.location.host` and
// `navigator.userAgent` which are unavailable during the server render.
// We compute it inside useEffect so the rendered href never carries the
// `https:///api/...` (empty authority) shape that triggers React's
// hydration warning on first paint.
export default function SubscribeButton({ districtId }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const [subscribeUrl, setSubscribeUrl] = useState<string | null>(null);

  useEffect(() => {
    // useEffect only runs on the client, so window/navigator are always
    // defined here — no SSR guard needed (F-18).
    setSubscribeUrl(
      gomiSubscriptionUrl(districtId, window.location.host, navigator.userAgent),
    );
  }, [districtId]);

  async function handleCopy() {
    if (subscribeUrl == null) return;
    try {
      await navigator.clipboard.writeText(subscribeUrl);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
      <p className="text-sm font-medium text-emerald-900">
        カレンダー連携 (収集日を Google / Apple / Outlook に取り込む)
      </p>
      <div className="flex flex-wrap gap-2">
        {subscribeUrl ? (
          <a
            href={subscribeUrl}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <span aria-hidden="true">📅</span>
            <span>カレンダーに登録</span>
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-300 px-3 py-2 text-sm font-medium text-white cursor-not-allowed"
          >
            <span aria-hidden="true">📅</span>
            <span>カレンダーに登録</span>
          </span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          disabled={subscribeUrl == null}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === "copied"
            ? "✅ コピーしました"
            : status === "error"
              ? "❌ コピーに失敗"
              : "URL をコピー"}
        </button>
      </div>
      <p className="text-xs text-emerald-700">
        購読方式なので毎日の更新が自動で反映されます。Apple Calendar の場合は
        Mac か iPhone の設定アプリ →「カレンダー」→「アカウント」→
        「アカウントを追加」→「その他」→「照会するカレンダーを追加」へ貼り付けてください。
      </p>
    </div>
  );
}
