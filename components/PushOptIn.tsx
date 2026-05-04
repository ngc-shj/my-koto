"use client";

import { useCallback, useEffect, useState } from "react";
import { NOTIFY_HOUR_MAX, NOTIFY_HOUR_MIN } from "@/lib/push/types";

type Status =
  | "loading"
  | "unsupported"
  | "needs-install" // iOS Safari outside PWA standalone mode
  | "no-district"
  | "default" // permission not yet requested
  | "denied"
  | "subscribed"
  | "error";

const HOUR_OPTIONS = (() => {
  const out: number[] = [];
  for (let h = NOTIFY_HOUR_MIN; h <= NOTIFY_HOUR_MAX; h += 1) out.push(h);
  return out;
})();

const DEFAULT_HOUR = 20;

export type PushOptInProps = {
  districtId: string | null;
};

export default function PushOptIn({ districtId }: PushOptInProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [hour, setHour] = useState<number>(DEFAULT_HOUR);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!isSupported()) {
      setStatus("unsupported");
      return;
    }
    if (isIosNonStandalone()) {
      setStatus("needs-install");
      return;
    }
    if (!districtId) {
      setStatus("no-district");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "subscribed" : "default");
    } catch {
      setStatus("error");
    }
  }, [districtId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleEnable = useCallback(async () => {
    if (!districtId) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "default");
        return;
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        throw new Error("VAPID public key is not configured");
      }
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: lib.dom's BufferSource accepts Uint8Array, but recent TS
        // tightening makes the generic ArrayBuffer parameter mismatch fire
        // before the API ever sees the value. The runtime is unaffected.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      await postSubscription(subscription, districtId, hour);
      setStatus("subscribed");
    } catch (err) {
      setStatus("error");
      setErrorMessage(messageOf(err));
    } finally {
      setBusy(false);
    }
  }, [districtId, hour]);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => null);
        await sub.unsubscribe().catch(() => null);
      }
      setStatus("default");
    } catch (err) {
      setStatus("error");
      setErrorMessage(messageOf(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleHourChange = useCallback(
    async (next: number) => {
      setHour(next);
      if (status !== "subscribed" || !districtId) return;
      setBusy(true);
      setErrorMessage(null);
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await postSubscription(sub, districtId, next);
        }
      } catch (err) {
        setErrorMessage(messageOf(err));
      } finally {
        setBusy(false);
      }
    },
    [districtId, status],
  );

  return (
    <section className="space-y-3 border-t border-gray-200 pt-6">
      <h2 className="text-lg font-semibold text-gray-800">プッシュ通知</h2>
      <p className="text-sm text-gray-600">
        翌日のごみ収集を前日の指定時刻にお知らせします (任意)。
      </p>

      {status === "loading" && (
        <p className="text-sm text-gray-500">確認中…</p>
      )}

      {status === "unsupported" && (
        <p className="text-sm text-gray-500">
          このブラウザはプッシュ通知に対応していません。
        </p>
      )}

      {status === "needs-install" && (
        <p className="text-sm text-gray-500">
          iOS では「ホーム画面に追加」した後に有効化してください。
        </p>
      )}

      {status === "no-district" && (
        <p className="text-sm text-gray-500">
          先に上記でごみ収集地区を選択してください。
        </p>
      )}

      {status === "denied" && (
        <p className="text-sm text-gray-500">
          通知がブロックされています。ブラウザの設定で許可してください。
        </p>
      )}

      {(status === "default" ||
        status === "subscribed" ||
        status === "error") && (
        <div className="space-y-3">
          <label className="block text-sm text-gray-700">
            通知時刻 (前日)
            <select
              value={hour}
              onChange={(e) => void handleHourChange(Number(e.target.value))}
              disabled={busy}
              className="ml-2 px-2 py-1 text-sm border border-gray-300 rounded"
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </label>

          {status !== "subscribed" ? (
            <button
              type="button"
              onClick={() => void handleEnable()}
              disabled={busy || !districtId}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              通知を有効にする
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleDisable()}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              通知を無効にする
            </button>
          )}

          {errorMessage && (
            <p className="text-sm text-red-700" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function isIosNonStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  const isIos = /iPhone|iPad|iPod/.test(ua);
  if (!isIos) return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS-specific legacy flag
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;
  return !standalone;
}

async function postSubscription(
  sub: PushSubscription,
  district: string,
  hour: number,
): Promise<void> {
  const json = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      },
      district,
      hour,
    }),
  });
  if (!res.ok) {
    throw new Error(`サブスクリプション登録に失敗しました (${res.status})`);
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "通知の設定に失敗しました";
}

// VAPID public key (URL-safe base64) → Uint8Array for `applicationServerKey`.
// Exported only for tests; the component itself uses it inline above.
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output;
}
