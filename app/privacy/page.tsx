import type { Metadata } from "next";
import BackToHome from "@/components/BackToHome";
import { messages } from "@/lib/i18n/messages";

export const metadata: Metadata = {
  title: `${messages.privacy.heading} | My こうとう (非公式)`,
};

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <BackToHome />
      <h1 className="text-2xl font-bold">{messages.privacy.heading}</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">収集する情報</h2>
        <p className="text-gray-700">
          本サービスはユーザーの個人情報を収集しません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">位置情報 (Geolocation) の取り扱い</h2>
        <p className="text-gray-700">
          マップ機能では、現在地を表示するためにブラウザの Geolocation API を使用する場合があります。
          取得した位置情報は端末内のみで処理され、外部サーバーへは送信されません。
          Cookie や LocalStorage への保存も行いません。
        </p>
        <p className="text-gray-700">
          位置情報の使用は任意です。拒否した場合は江東区中心座標を代わりに使用します。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Cookie の使用</h2>
        <p className="text-gray-700">
          本サービスは Cookie を使用しません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">LocalStorage の使用</h2>
        <p className="text-gray-700">
          選択した地区などの設定情報のみ、お使いの端末の LocalStorage に保存します。
          個人情報・健康情報・財務情報は保存しません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">外部サービスへの通信</h2>
        <p className="text-gray-700">
          天気情報の取得のため、
          <a
            href="https://open-meteo.com"
            className="underline hover:text-gray-900"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open-Meteo
          </a>{" "}
          (CC-BY 4.0) への通信が発生します。送信されるのは江東区中心の固定座標のみです。
          ユーザーの位置情報は送信されません。
        </p>
        <p className="text-gray-700">
          WBGT (暑さ指数) の取得のため、本サービスのサーバーから
          <a
            href="https://www.wbgt.env.go.jp/"
            className="underline hover:text-gray-900"
            target="_blank"
            rel="noopener noreferrer"
          >
            環境省 熱中症予防情報サイト
          </a>
          への通信が発生します。リクエストは固定の観測所コード (44132 / 東京) 1
          つのみで、ユーザーを識別する情報は送信しません。
        </p>
        <p className="text-gray-700">
          地図タイルの表示のため、国土地理院のタイルサーバーへの通信が発生します。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">プッシュ通知</h2>
        <p className="text-gray-700">
          設定画面からプッシュ通知を有効にした場合のみ、ブラウザが発行するプッシュ購読情報
          (端末ごとに異なる Push サービスのエンドポイント URL と公開鍵)
          をサーバーに保存します。氏名・住所・メールアドレスなどの個人情報は含みません。
        </p>
        <p className="text-gray-700">
          通知時刻になると、選択された地区の翌日のごみ収集情報をサーバーから
          ブラウザベンダーの Push サービス
          (Apple、Google、Mozilla 等。お使いの環境により異なります)
          を経由して送信します。本サービスから外部の解析・広告事業者への送信は行いません。
        </p>
        <p className="text-gray-700">
          通知を無効にすると、購読情報はサーバーから即時に削除されます。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">CSP 違反レポート</h2>
        <p className="text-gray-700">
          ブラウザが Content-Security-Policy
          のルール違反を検知した場合、その内容を本サービスのサーバー
          (`/api/csp-report`) に通知します。これは外部の解析・広告事業者ではなく、
          サイト運営者がポリシー設定の不具合を検知するための仕組みです。
        </p>
        <p className="text-gray-700">
          受信した内容は (1) URL のクエリ文字列を削除し、
          (2) User-Agent をブラウザ名のみに丸めた上で、
          直近 50 件まで保存します (`/status` で表示)。氏名・住所・メールアドレス等の個人情報は含みません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">アクセス解析</h2>
        <p className="text-gray-700">
          本サービスはアクセス解析ツールを使用していません。
        </p>
      </section>
    </div>
  );
}
