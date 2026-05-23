"use client";

import { useEffect, useState } from "react";
import DataFreshness from "@/components/DataFreshness";
import { KanjiText } from "@/components/Furigana";
import { formatDateTime } from "@/lib/i18n/datetime";
import type { AreaWarnings, NormalizedWarning } from "@/lib/jma/normalize";
import type { WarningTier } from "@/lib/jma/warning-codes";

type State =
  | { status: "loading" }
  | { status: "success"; data: AreaWarnings; fetchedAt: Date }
  | { status: "error" };

const TIER_STYLE: Record<
  WarningTier,
  { container: string; badge: string; label: string }
> = {
  special: {
    container: "border-purple-300 bg-purple-50",
    badge: "bg-purple-700 text-white",
    label: "特別警報",
  },
  warning: {
    container: "border-red-300 bg-red-50",
    badge: "bg-red-600 text-white",
    label: "警報",
  },
  info: {
    container: "border-amber-300 bg-amber-50",
    badge: "bg-amber-600 text-white",
    label: "気象情報",
  },
  advisory: {
    container: "border-yellow-300 bg-yellow-50",
    badge: "bg-yellow-600 text-white",
    label: "注意報",
  },
};

function isAreaWarnings(v: unknown): v is AreaWarnings {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.reportDatetime === "string" &&
    typeof o.areaCode === "string" &&
    Array.isArray(o.warnings)
  );
}

export default function JmaWarningPanel() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/jma-warnings", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw: unknown = await res.json();
        if (!isAreaWarnings(raw)) {
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
        <KanjiText text="気象警報・注意報を読み込み中…" />
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <KanjiText text="気象警報・注意報の取得に失敗しました。" />{" "}
        <a
          href="https://www.jma.go.jp/bosai/warning/"
          className="underline ml-1"
          target="_blank"
          rel="noopener noreferrer"
        >
          <KanjiText text="気象庁 防災情報サイト" />
        </a>{" "}
        <KanjiText text="をご確認ください。" />
      </section>
    );
  }

  const { data, fetchedAt } = state;

  return (
    <section className="space-y-3" aria-labelledby="jma-warning-heading">
      <div>
        <h2
          id="jma-warning-heading"
          className="text-lg font-semibold text-gray-800"
        >
          <KanjiText text="気象警報・注意報 (江東区)" />
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          <KanjiText text="発表時刻:" /> {formatDateTime(data.reportDatetime)}
          {data.publishingOffice && `（${data.publishingOffice}）`}
        </p>
      </div>

      {data.warnings.length === 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <KanjiText text="現在、江東区に発表されている気象警報・注意報はありません。" />
        </div>
      ) : (
        <ul className="space-y-2" aria-live="polite">
          {data.warnings.map((w: NormalizedWarning) => {
            const style = TIER_STYLE[w.tier];
            return (
              <li
                key={`${w.code ?? "x"}-${w.label}`}
                className={`rounded-lg border p-3 ${style.container}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.badge}`}
                  >
                    {style.label}
                  </span>
                  <span className="font-semibold text-gray-800">
                    <KanjiText text={w.label} />
                  </span>
                  <span className="text-xs text-gray-600">
                    <KanjiText text={`(${w.status})`} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data.headlineText.length > 0 && (
        <p className="text-sm text-gray-600">
          <KanjiText text={data.headlineText} />
        </p>
      )}

      <DataFreshness lastModified={fetchedAt} label="取得日時" />

      <p className="text-xs text-gray-400">
        <KanjiText text="出典:" />{" "}
        <a
          href="https://www.jma.go.jp/bosai/warning/"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          <KanjiText text="気象庁 防災情報" />
        </a>
      </p>
    </section>
  );
}
