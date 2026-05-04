// All user-facing strings are centralized here.
// Using `as const` ensures TypeScript catches missing keys at compile time.
export const messages = {
  brand: {
    title: "My こうとう (非公式)",
    name: "My こうとう",
    unofficial: "非公式",
    tagline: "江東区の生活情報",
  },
  footer: {
    disclaimer: "このサイトは江東区の公式サイトではありません。",
    attribution:
      "江東区・東京都が提供するオープンデータを CC-BY 4.0 のもとで利用しています。",
    licenseLabel: "CC-BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.ja",
  },
  nav: {
    home: "ホーム",
    gomi: "ゴミ収集",
    map: "マップ",
    events: "イベント",
    weather: "天気",
    settings: "設定",
    about: "このサイトについて",
    privacy: "プライバシーポリシー",
    disclaimer: "免責事項",
  },
  about: {
    heading: "このサイトについて",
    officialDisclaimer: "このサイトは江東区の公式サイトではありません。",
    operator: "運営: 個人 (非公式)",
    copyright:
      "掲載データの著作権は各提供元 (東京都・江東区、国土地理院、Open-Meteo 等) に帰属します。",
    license: "データライセンス: CC-BY 4.0",
  },
  privacy: {
    heading: "プライバシーポリシー",
  },
  disclaimer: {
    heading: "免責事項",
    aedWarning: "AED の使用より 119 番への通報を最優先にしてください。",
    dataAccuracy: "掲載情報の正確性について保証はしません。公式サイトでの確認をお勧めします。",
  },
  error: {
    notFound: "ページが見つかりません",
    notFoundDescription: "お探しのページは存在しないか、移動した可能性があります。",
    generic: "エラーが発生しました",
    offline: "オフラインです",
    offlineDescription: "インターネット接続を確認してください。",
    backHome: "トップページへ戻る",
    retry: "再試行",
  },
} as const;

export type Messages = typeof messages;
