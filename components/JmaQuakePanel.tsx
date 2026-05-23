"use client";

import { useEffect, useState } from "react";
import DataFreshness from "@/components/DataFreshness";
import { KanjiText } from "@/components/Furigana";
import { formatDateTime } from "@/lib/i18n/datetime";
import type { NormalizedQuake, QuakeFeed } from "@/lib/jma/quake";

type State =
  | { status: "loading" }
  | { status: "success"; data: QuakeFeed; fetchedAt: Date }
  | { status: "error" };

// Default view hides weak quakes nobody felt locally — 震度1〜2 nationwide
// fill the list daily and bury the events that matter. 江東区 で有感の地震は
// 震度に関わらず必ず残す。
const DEFAULT_MIN_SHINDO_DIGIT = 3;

function meetsDefaultFilter(q: NormalizedQuake): boolean {
  if (q.kotoShindo != null) return true;
  const head = q.maxShindo[0];
  if (head == null) return false;
  const digit = Number.parseInt(head, 10);
  return Number.isFinite(digit) && digit >= DEFAULT_MIN_SHINDO_DIGIT;
}

function isQuakeFeed(v: unknown): v is QuakeFeed {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.events) && typeof o.feltInKotoCount === "number";
}

// Tier color by max observed shindo nationally. JMA returns values such as
// "1", "2", "3", "4", "5-", "5+", "6-", "6+", "7" — we tier on the
// integer portion plus the +/- suffix so 5+ is louder than 5-.
function shindoTone(maxi: string): string {
  const head = maxi[0] ?? "0";
  if (head === "7" || head === "6") return "bg-red-700 text-white";
  if (head === "5") return "bg-red-500 text-white";
  if (head === "4") return "bg-orange-500 text-white";
  if (head === "3") return "bg-amber-500 text-white";
  if (head === "1" || head === "2") return "bg-yellow-300 text-yellow-900";
  return "bg-gray-300 text-gray-700";
}

export default function JmaQuakePanel() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/jma-quakes", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw: unknown = await res.json();
        if (!isQuakeFeed(raw)) {
          setState({ status: "error" });
          return;
        }
        setState({ status: "success", data: raw, fetchedAt: new Date() });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  if (state.status === "loading") {
    return (
      <section className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
        <KanjiText text="地震情報を読み込み中…" />
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <KanjiText text="地震情報の取得に失敗しました。" />{" "}
        <a
          href="https://www.jma.go.jp/bosai/quake/"
          className="underline ml-1"
          target="_blank"
          rel="noopener noreferrer"
        >
          <KanjiText text="気象庁 地震情報" />
        </a>{" "}
        <KanjiText text="をご確認ください。" />
      </section>
    );
  }

  const { data, fetchedAt } = state;
  const filteredEvents = data.events.filter(meetsDefaultFilter);
  const events = showAll ? data.events.slice(0, 10) : filteredEvents;
  const hiddenCount = data.events.length - filteredEvents.length;

  return (
    <section className="space-y-3" aria-labelledby="jma-quake-heading">
      <div>
        <h2
          id="jma-quake-heading"
          className="text-lg font-semibold text-gray-800"
        >
          <KanjiText text="最近の地震" />
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          <KanjiText
            text={`直近 ${data.events.length} 件中、江東区で観測 ${data.feltInKotoCount} 件`}
          />
        </p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <KanjiText
            text={
              showAll
                ? "直近の有感地震はありません。"
                : "直近で最大震度3以上の地震はありません。"
            }
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((q: NormalizedQuake) => {
            const felt = q.kotoShindo != null;
            return (
              <li
                key={q.eventId}
                className={`rounded-lg border p-3 ${
                  felt ? "border-amber-300 bg-amber-50" : "border-gray-200"
                }`}
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm text-gray-600 tabular-nums">
                    {formatDateTime(q.occurredAt)}
                  </span>
                  <span className="font-semibold text-gray-800">
                    <KanjiText text={q.epicenter} />
                  </span>
                  {q.magnitude != null && (
                    <span className="text-xs text-gray-600 tabular-nums">
                      M {q.magnitude}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap mt-1 text-xs">
                  {q.maxShindo.length > 0 && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${shindoTone(q.maxShindo)}`}
                    >
                      <KanjiText text="最大震度" /> {q.maxShindo}
                    </span>
                  )}
                  {felt && q.kotoShindo != null && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-amber-200 text-amber-900">
                      <KanjiText text="江東区" /> 震度 {q.kotoShindo}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-label={
            showAll ? "震度1〜2を隠す" : `震度1〜2を${hiddenCount}件含めて表示`
          }
          className="text-xs text-blue-600 underline hover:text-blue-800"
        >
          <KanjiText
            text={
              showAll
                ? "震度1〜2を隠す"
                : `震度1〜2を${hiddenCount}件含めて表示`
            }
          />
        </button>
      )}

      <DataFreshness lastModified={fetchedAt} label="取得日時" />

      <p className="text-xs text-gray-400">
        <KanjiText text="出典:" />{" "}
        <a
          href="https://www.jma.go.jp/bosai/quake/"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          <KanjiText text="気象庁 地震情報" />
        </a>
      </p>
    </section>
  );
}
