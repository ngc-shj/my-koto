"use client";

import { useState } from "react";
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
export default function SubscribeButton({ districtId }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  function getHost(): string {
    if (typeof window === "undefined") return "";
    return window.location.host;
  }

  function getUserAgent(): string {
    if (typeof navigator === "undefined") return "";
    return navigator.userAgent;
  }

  const subscribeUrl = gomiSubscriptionUrl(
    districtId,
    getHost(),
    getUserAgent(),
  );

  async function handleCopy() {
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
        <a
          href={subscribeUrl}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <span aria-hidden="true">📅</span>
          <span>カレンダーに登録</span>
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
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
