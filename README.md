# My こうとう (非公式)

**このサービスは江東区の公式サイトではありません。**

江東区民が日常的に使う行政情報（ゴミ収集、AED、公衆トイレ、区主催イベント、天気）を一画面に集約した非公式 PWA です。
江東区・東京都・各データ提供元は本サービスとは無関係です。

## データソース・ライセンス

| データ | 提供元 | ライセンス |
|--------|--------|-----------|
| ゴミ収集・AED・トイレ・イベント | 東京都・江東区 (東京都オープンデータカタログ) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 天気予報 | [Open-Meteo](https://open-meteo.com) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 地図タイル | [国土地理院](https://maps.gsi.go.jp/development/ichiran.html) | 国土地理院コンテンツ利用規約 |

本サービスは上記オープンデータを一部加工して利用しています。

## 開発環境セットアップ

```bash
# --ignore-scripts は S25 対応 (scripts を実行しない安全な install)
npm ci --ignore-scripts

# 開発サーバー起動
npm run dev

# テスト
npm run test

# ビルド
npm run build
```

## PWA アイコンの生成

`public/icons/` 以下の PNG アイコンはプレースホルダです。
外部依存なしの純 Node.js スクリプトで生成します:

```bash
node scripts/generate-icons.mjs
```

本番用アイコンに差し替える場合は、192x192 と 512x512 の PNG を用意して
`public/icons/` に配置してください (maskable 版は同サイズで安全ゾーン 80% 対応)。

## --ignore-scripts の運用例外

`.npmrc` に `ignore-scripts=true` を設定しています。
ネイティブアドオンのビルドが必要なパッケージを追加する際は、
`can-i-ignore-scripts` ツールでレビューし、README に個別許可の記録を残してください。

現在の例外: なし

## 観測性ツール導入の判断条件

Sentry / Vercel Analytics 等の観測性ツールを導入する場合は、以下をすべて満たすこと:

1. PII フィルタ設定を ON にすること
2. ユーザーへの同意 UI を実装すること
3. `next.config.ts` の CSP `connect-src` に当該ドメインを追加すること
4. `/privacy` ページを更新すること

## kill switch (フェーズ 2 予定)

一定期間更新が停止した場合に Service Worker から `/maintenance` にリダイレクトする仕組みを
フェーズ 2 で導入予定。

## 技術スタック

- **Framework**: Next.js 15 (App Router) + TypeScript
- **UI**: Tailwind CSS
- **Test**: Vitest + Testing Library + vitest-axe
- **Hosting**: Vercel (Hobby)
