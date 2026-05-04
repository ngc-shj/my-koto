"use client";

import { useEffect, useState } from "react";
import DataFreshness from "@/components/DataFreshness";
import {
  WbgtDataSchema,
  type WbgtData,
  type WbgtReading,
} from "@/lib/opendata/schemas/wbgt";

// 環境省 alert thresholds (`日常生活における熱中症予防指針 Ver.4`).
// We render the band that contains `value`. The `≥` boundary is inclusive
// so a reading of exactly 28 °C lands on 厳重警戒 rather than 警戒.
type AlertBand = {
  readonly threshold: number;
  readonly label: string;
  readonly tone: string; // Tailwind classes for badge background/foreground.
  readonly note: string;
};

const ALERT_BANDS: readonly AlertBand[] = [
  {
    threshold: 31,
    label: "危険",
    tone: "bg-red-700 text-white",
    note: "高齢者は安静状態でも発生する危険性。外出はなるべく避ける",
  },
  {
    threshold: 28,
    label: "厳重警戒",
    tone: "bg-orange-600 text-white",
    note: "外出時は炎天下を避け、室内では室温の上昇に注意",
  },
  {
    threshold: 25,
    label: "警戒",
    tone: "bg-amber-500 text-white",
    note: "運動や激しい作業をする際は定期的に十分な休息を取り入れる",
  },
  {
    threshold: 21,
    label: "注意",
    tone: "bg-yellow-300 text-yellow-900",
    note: "一般に危険性は少ないが激しい運動・重労働時には熱中症の発生に注意",
  },
  {
    threshold: 0,
    label: "ほぼ安全",
    tone: "bg-emerald-600 text-white",
    note: "通常生活で熱中症の危険は低い",
  },
];

function classify(value: number): AlertBand {
  for (const band of ALERT_BANDS) {
    if (value >= band.threshold) return band;
  }
  return ALERT_BANDS[ALERT_BANDS.length - 1];
}

function formatHourLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // 8月3日 15時 — JST is the source of truth for these times.
  const month = d.toLocaleString("ja-JP", { month: "long", timeZone: "Asia/Tokyo" });
  const day = d.toLocaleString("ja-JP", { day: "numeric", timeZone: "Asia/Tokyo" });
  const hour = d.toLocaleString("ja-JP", { hour: "numeric", timeZone: "Asia/Tokyo", hour12: false });
  return `${month}${day} ${hour}`;
}

type State =
  | { status: "loading" }
  | { status: "success"; data: WbgtData; fetchedAt: Date }
  | { status: "empty" }
  | { status: "error" };

export default function WbgtPanel() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/wbgt", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as unknown;
        const parsed = WbgtDataSchema.safeParse(raw);
        if (!parsed.success) {
          setState({ status: "error" });
          return;
        }
        if (parsed.data.readings.length === 0) {
          setState({ status: "empty" });
          return;
        }
        setState({ status: "success", data: parsed.data, fetchedAt: new Date() });
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
        WBGT (暑さ指数) を読み込み中…
      </section>
    );
  }

  if (state.status === "error" || state.status === "empty") {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        WBGT の取得に失敗しました。
        <a
          href="https://www.wbgt.env.go.jp/"
          className="underline ml-1"
          target="_blank"
          rel="noopener noreferrer"
        >
          環境省 熱中症予防情報サイト
        </a>{" "}
        を直接ご確認ください。
      </section>
    );
  }

  const upcoming = state.data.readings.slice(0, 6);
  const next = upcoming[0];
  const band = classify(next.wbgt);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          WBGT (暑さ指数 / 熱中症の危険度)
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          環境省 熱中症予防情報サイト・東京観測所 (station 44132)
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className={`px-3 py-1 rounded-full text-sm font-bold ${band.tone}`}
          >
            {band.label}
          </span>
          <span className="text-3xl font-bold text-gray-800">
            {next.wbgt.toFixed(1)}
            <span className="text-lg font-medium text-gray-500 ml-1">℃</span>
          </span>
          <span className="text-xs text-gray-500">
            ({formatHourLabel(next.datetime)} 時点)
          </span>
        </div>
        <p className="text-sm text-gray-600">{band.note}</p>
      </div>

      <table className="w-full text-sm border-collapse">
        <caption className="text-xs text-gray-500 text-left mb-1">
          今後の予測 ({upcoming.length} 時点)
        </caption>
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-200">
            <th className="text-left font-normal py-1.5 pr-2">時刻</th>
            <th className="text-right font-normal py-1.5 px-2">WBGT</th>
            <th className="text-left font-normal py-1.5 pl-2">レベル</th>
          </tr>
        </thead>
        <tbody>
          {upcoming.map((r: WbgtReading) => {
            const b = classify(r.wbgt);
            return (
              <tr key={r.datetime} className="border-b border-gray-100">
                <td className="py-1.5 pr-2 text-gray-700">
                  {formatHourLabel(r.datetime)}
                </td>
                <td className="py-1.5 px-2 text-right font-medium text-gray-800">
                  {r.wbgt.toFixed(1)} ℃
                </td>
                <td className="py-1.5 pl-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${b.tone}`}
                  >
                    {b.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <DataFreshness lastModified={state.fetchedAt} label="取得日時" />

      <p className="text-xs text-gray-400">
        出典:{" "}
        <a
          href="https://www.wbgt.env.go.jp/"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          環境省 熱中症予防情報サイト
        </a>{" "}
        — 算出元:{" "}
        <a
          href="https://www.data.jma.go.jp/"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          気象庁数値予報
        </a>
      </p>
    </section>
  );
}
