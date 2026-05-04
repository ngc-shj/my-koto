import type { Metadata } from "next";
import BackToHome from "@/components/BackToHome";
import { KanjiAuto } from "@/components/Furigana";
import { ATTRIBUTIONS } from "@/config/attribution";
import { messages } from "@/lib/i18n/messages";

export const metadata: Metadata = {
  title: `${messages.about.heading} | My こうとう (非公式)`,
};

export default function AboutPage() {
  return (
    <KanjiAuto>
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <BackToHome />
      <h1 className="text-2xl font-bold">{messages.about.heading}</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">非公式サイトについて</h2>
        <p className="text-gray-700">{messages.about.officialDisclaimer}</p>
        <p className="text-gray-700">
          本サービスは江東区・東京都が公開するオープンデータを活用した個人運営の非公式サービスです。
          江東区・東京都・各データ提供元は本サービスとは無関係です。
        </p>
        <p className="text-gray-700">{messages.about.operator}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">著作権・ライセンス</h2>
        <p className="text-gray-700">{messages.about.copyright}</p>
        <p className="text-gray-700">
          {messages.about.license} —{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/deed.ja"
            className="underline hover:text-gray-900"
            target="_blank"
            rel="noopener noreferrer"
          >
            Creative Commons Attribution 4.0 International
          </a>
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">データソース一覧</h2>
        <ul className="space-y-3">
          {ATTRIBUTIONS.map((attr) => (
            <li key={attr.id} className="border border-gray-200 rounded p-3">
              <div className="font-medium">{attr.name}</div>
              <div className="text-sm text-gray-600">
                著作権者: {attr.copyrightHolder}
                {attr.modified && " (一部加工して利用)"}
              </div>
              <div className="text-sm text-gray-600">
                ライセンス:{" "}
                <a
                  href={attr.licenseUrl}
                  className="underline hover:text-gray-900"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {attr.licenseLabel}
                </a>
              </div>
              <div className="text-sm text-gray-600">
                出典:{" "}
                <a
                  href={attr.sourceUrl}
                  className="underline hover:text-gray-900"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {attr.sourceUrl}
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">運営者情報</h2>
        <p className="text-gray-700">
          本サービスに関するお問い合わせは、当サイト上の連絡先からお願いします。
        </p>
      </section>
    </div>
    </KanjiAuto>
  );
}
