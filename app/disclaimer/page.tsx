import type { Metadata } from "next";
import BackToHome from "@/components/BackToHome";
import { KanjiAuto } from "@/components/Furigana";
import { messages } from "@/lib/i18n/messages";

export const metadata: Metadata = {
  title: `${messages.disclaimer.heading} | My こうとう (非公式)`,
};

export default function DisclaimerPage() {
  return (
    <KanjiAuto>
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <BackToHome />
      <h1 className="text-2xl font-bold">{messages.disclaimer.heading}</h1>

      <section className="space-y-2 p-4 bg-red-50 border border-red-200 rounded">
        <h2 className="text-lg font-semibold text-red-800">AED・緊急時について</h2>
        <p className="text-red-700 font-medium">{messages.disclaimer.aedWarning}</p>
        <p className="text-red-700">
          AED の使用を考える前に、まず 119 番に通報してください。
          本サービスの AED 設置情報は参考情報であり、実際の設置状況と異なる場合があります。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">情報の正確性</h2>
        <p className="text-gray-700">{messages.disclaimer.dataAccuracy}</p>
        <p className="text-gray-700">
          掲載データはオープンデータを加工したものであり、最新情報でない場合があります。
          重要事項については必ず江東区の公式サイトでご確認ください。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">健康・生命に関わる情報の限界</h2>
        <p className="text-gray-700">
          暑さ指数 (WBGT) などの健康情報は参考値です。
          実際の体調や環境は個人差があります。
          本サービスの情報に基づく行動による損害について、当サービスは一切の責任を負いません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">サービスの継続性</h2>
        <p className="text-gray-700">
          本サービスは個人が運営する非公式サービスです。
          予告なくサービスを停止・変更する場合があります。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">外部リンク</h2>
        <p className="text-gray-700">
          本サービスからリンクされた外部サイトの内容について、当サービスは責任を負いません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">非公式サイトであることの明示</h2>
        <p className="text-gray-700">
          本サービスは江東区・東京都・その関係機関とは無関係の個人が運営するサービスです。
          公式の情報は{" "}
          <a
            href="https://www.city.koto.lg.jp/"
            className="underline hover:text-gray-900"
            target="_blank"
            rel="noopener noreferrer"
          >
            江東区公式サイト
          </a>{" "}
          をご参照ください。
        </p>
      </section>
    </div>
    </KanjiAuto>
  );
}
