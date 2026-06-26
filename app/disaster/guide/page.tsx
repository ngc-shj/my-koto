import type { Metadata } from "next";
import { KanjiAuto, KanjiText } from "@/components/Furigana";
import PageHeader from "@/components/PageHeader";
import EmergencyChecklist from "@/components/EmergencyChecklist";
import {
  EVACUATION_NOTES,
  HAZARD_ACTIONS,
  OFFICIAL_LINKS,
} from "@/config/disaster-guide";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const metadata: Metadata = {
  title: "防災の備え (備蓄・避難の心得) | My こうとう (非公式)",
  description:
    "江東区での災害に備えるための非常持ち出し品チェックリスト、ハザード別の行動、避難の心得をまとめました。",
};

export default function DisasterGuidePage() {
  return (
    <KanjiAuto>
      <PageHeader
        back={{ href: "/disaster", label: "防災マップへ戻る" }}
        title="防災の備え"
        share={{ title: "防災の備え", url: `${SITE_URL}/disaster/guide` }}
        maxWidth="4xl"
      />

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-10">
        <p className="text-sm text-gray-600">
          <KanjiText text="江東区は海抜の低い地域が多く、地震に加えて水害への備えが大切です。平常時にできる備えをまとめました。" />
        </p>

        {/* 非常持ち出し品・備蓄チェックリスト (interactive) */}
        <EmergencyChecklist />

        {/* ハザード別の行動指針 */}
        <section className="space-y-4" aria-labelledby="actions-heading">
          <h2 id="actions-heading" className="text-lg font-semibold">
            <KanjiText text="災害が起きたときの行動" />
          </h2>
          <div className="space-y-3">
            {HAZARD_ACTIONS.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-gray-200 p-4 space-y-2"
              >
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <span aria-hidden="true">{a.icon}</span>
                  <KanjiText text={a.title} />
                </h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                  {a.points.map((p, i) => (
                    <li key={i}>
                      <KanjiText text={p} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 避難の心得 */}
        <section className="space-y-4" aria-labelledby="evac-heading">
          <h2 id="evac-heading" className="text-lg font-semibold">
            <KanjiText text="避難の心得" />
          </h2>
          <dl className="space-y-3">
            {EVACUATION_NOTES.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border border-gray-200 p-4"
              >
                <dt className="font-semibold text-gray-800">
                  <KanjiText text={n.term} />
                </dt>
                <dd className="mt-1 text-sm text-gray-700">
                  <KanjiText text={n.desc} />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 公式防災ページへのリンク集 */}
        <section className="space-y-3" aria-labelledby="links-heading">
          <h2 id="links-heading" className="text-lg font-semibold">
            <KanjiText text="もっと詳しく (公式・参考情報)" />
          </h2>
          <ul className="space-y-2">
            {OFFICIAL_LINKS.map((l) => (
              <li key={l.id}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
                >
                  <span className="font-medium text-blue-700 underline">
                    <KanjiText text={l.label} />
                  </span>
                  {l.desc && (
                    <span className="block text-xs text-gray-600 mt-0.5">
                      <KanjiText text={l.desc} />
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400">
            <KanjiText text="本ページは一般的な防災情報をまとめた非公式の参考情報です。最新かつ正確な情報は江東区・気象庁などの公式発表をご確認ください。" />
          </p>
        </section>
      </div>
    </KanjiAuto>
  );
}
