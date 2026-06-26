"use client";

import { useState } from "react";
import { KanjiText } from "@/components/Furigana";

// 災害用伝言ダイヤル (171) / web171 への導線。災害時、電話が輻輳して通話が
// 繋がりにくいときに安否を残す/確認する公式手段。配信データは無く静的な
// ガイドなので、平時から畳んでおいて必要なときだけ開けるアコーディオン。
// 公式 江東区防災ポータルにあった「災害用伝言ダイヤルで安否確認」導線の取り込み。
export default function EmergencyContactCard() {
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-labelledby="emergency-contact-heading"
      className="rounded-lg border border-sky-200 bg-sky-50"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open ? "true" : "false"}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span
          id="emergency-contact-heading"
          className="flex items-center gap-2 text-sm font-semibold text-sky-900"
        >
          <span aria-hidden="true">📞</span>
          <KanjiText text="災害用伝言ダイヤル (171) で安否確認" />
        </span>
        <span aria-hidden="true" className="text-sky-700">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 text-sm text-sky-900">
          <p className="text-xs text-sky-800">
            <KanjiText text="大きな災害で電話が繋がりにくいとき、声の伝言を残したり聞いたりできる NTT の公式サービスです。" />
          </p>

          <div className="grid grid-cols-2 gap-2">
            <a
              href="tel:171"
              className="flex flex-col items-center justify-center rounded-md border border-sky-300 bg-white px-2 py-2 hover:bg-sky-100"
            >
              <span className="text-lg font-bold tracking-wider text-sky-800">
                171
              </span>
              <span className="text-[11px] text-sky-700">
                <KanjiText text="電話をかける" />
              </span>
            </a>
            <a
              href="https://www.web171.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center rounded-md border border-sky-300 bg-white px-2 py-2 hover:bg-sky-100"
            >
              <span className="text-base font-bold text-sky-800">web171</span>
              <span className="text-[11px] text-sky-700">
                <KanjiText text="文字で残す" />
              </span>
            </a>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-sky-800">
              <KanjiText text="使い方" />
            </p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-sky-800">
              <li>
                <KanjiText text="171 にダイヤルする" />
              </li>
              <li>
                <KanjiText text="伝言を残すなら 1、聞くなら 2 を押す" />
              </li>
              <li>
                <KanjiText text="自宅などの電話番号 (市外局番から) を入力する" />
              </li>
              <li>
                <KanjiText text="ガイダンスに従って伝言を録音・再生する" />
              </li>
            </ol>
          </div>

          <p className="text-[11px] text-sky-700">
            <KanjiText text="毎月 1 日・15 日や防災週間などに体験利用ができます。" />{" "}
            <a
              href="https://www.ntt-east.co.jp/saigai/voice171/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              <KanjiText text="使い方の詳細 (NTT)" />
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
