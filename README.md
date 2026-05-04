# My こうとう (非公式)

**このサービスは江東区の公式サイトではありません。**

江東区民が日常的に使う行政情報（ゴミ収集、AED、公衆トイレ、区主催イベント、天気）を
一画面に集約した非公式 PWA です。江東区・東京都・各データ提供元は本サービスとは無関係です。

## 主な機能

- **ゴミ収集カレンダー** — 公式 CSV (CC-BY 4.0) を取り込んだ 58 区分の収集ルートに対応。
  地区検索、月次/週次/当日・翌日ビュー、`webcal://` 購読 (UA 判定で iOS は webcal、他は https)
- **ゴミ品目検索** — wanakana を使った NFKC + ひら↔カナ + ローマ字 双方向の正規化検索。
  「ペットボトル」「ぺっとぼとる」「PET」「ﾍﾟｯﾄﾎﾞﾄﾙ」が同一結果
- **AED・公衆トイレマップ** — 江東区公式 (246 + 191 件) を同梱、地図を区外にパンすると
  OpenStreetMap Overpass から動的補完 (Tokyo 23 区内、bbox/area サーバ clamp、KV キャッシュ、
  30 req/min/IP)。江東区内は OSM 由来を除外して同梱データを優先
- **イベントカレンダー + ICS** — `ical-generator` + `@touch4it/ical-timezones` で VTIMEZONE
  同梱、`STATUS:CANCELLED`、全テキストフィールドのエスケープ、URL は https only
- **天気** — Open-Meteo を Edge proxy で取得、Vercel KV に stale-if-error キャッシュ、
  60 req/min/IP のレート制限、SSRF ハードニング (GET 限定 / redirect:'manual' / Zod 検証 /
  ヘッダ strip)
- **PWA** — Service Worker (build ID 付き cache name)、機内モードで `/offline`、
  Vercel preview では manifest を 404 にして本番との混同を防止
- **プッシュ通知 (Web Push)** — 翌日のごみ収集を前日の指定時刻 (JST 18-22 時)
  に通知。設定画面でオプトイン制。VAPID 鍵で署名、購読情報は Vercel KV に
  保存。配信は GitHub Actions cron (`.github/workflows/push-dispatch.yml`)
  から `/api/push/dispatch` を叩く方式 (Vercel Hobby は cron が日次までのため)
- **CSP** — 本番は `script-src 'self' 'nonce-XXX' 'strict-dynamic'` (unsafe-eval/inline なし)。
  middleware で nonce を生成 (`crypto.getRandomValues`、128bit Base64URL)。
  HSTS / COOP / CORP / Permissions-Policy 全て付与

## データソース・ライセンス

| データ | 提供元 | ライセンス |
|--------|--------|-----------|
| ゴミ収集・AED・公衆トイレ・イベント | 東京都・江東区 ([東京都オープンデータカタログ](https://catalog.data.metro.tokyo.lg.jp/dataset?organization=t131083)) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 23 区内 AED/トイレ補完データ | [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) | ODbL |
| 天気予報 | [Open-Meteo](https://open-meteo.com) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 地図タイル | [国土地理院 標準地図](https://maps.gsi.go.jp/development/ichiran.html) | 国土地理院コンテンツ利用規約 |

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

## データ更新スクリプト

公式 CSV から `data/*.json` を再生成します。Shift_JIS / UTF-8 BOM の差を内部で吸収します。

```bash
# 江東区ゴミ収集 (公式 CSV → data/districts.json)
node scripts/generate-districts.mjs

# 江東区 AED/トイレ (公式 CSV → data/aed.json + data/toilet.json)
# `tsx` 経由で TypeScript を直接実行 (lib/csv.ts と parser 共有)
npx tsx scripts/generate-pois.ts

# 開発時に東京都オープンデータ API のレスポンスを fixture として保存
npx tsx scripts/refresh-fixtures.ts
```

## GitHub Actions data-sync ワークフロー

`.github/workflows/data-sync.yml` が JST 03:00 に cron 実行され、
スキーマ違反を検出した場合は Discord webhook で通知します。

- `permissions: { contents: write, pull-requests: write }` (最小)
- auto-commit は禁止。`peter-evans/create-pull-request` で PR を起票し、
  人手でマージする運用
- 必要な GitHub Secrets:
  - `DISCORD_WEBHOOK` — 失敗通知の送信先 (workflow 冒頭で `::add-mask::` 済)

## Vercel 本番デプロイ

```bash
# Vercel CLI 経由 (環境変数は Vercel ダッシュボードで設定)
npx vercel deploy --prod
```

必要な Vercel 環境変数:

| 変数 | 用途 |
|------|------|
| `KV_URL` / `KV_REST_API_URL` / `KV_REST_API_TOKEN` / `KV_REST_API_READ_ONLY_TOKEN` | Vercel KV (天気プロキシ・OSM POI のキャッシュ + レート制限・Push 購読の永続化) |
| `NEXT_PUBLIC_SITE_URL` | OG 画像生成・CORS の origin (本番ドメイン) |
| `DISCORD_WEBHOOK` | データ取得失敗の通知 (任意) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push 公開鍵 (`pushManager.subscribe` の `applicationServerKey`) |
| `VAPID_PRIVATE_KEY` | Web Push 秘密鍵 (`/api/push/dispatch` のみで使用) |
| `VAPID_SUBJECT` | VAPID 連絡先 (`mailto:` URL、Push サービスからの通知を受け取るアドレス) |
| `PUSH_DISPATCH_SECRET` | `/api/push/dispatch` の Bearer トークン。GitHub Actions と一致させる |

GitHub Actions 側 (`.github/workflows/push-dispatch.yml`) の Secrets:

- `PUSH_DISPATCH_ENDPOINT` — `https://<site>/api/push/dispatch` の絶対 URL
- `PUSH_DISPATCH_SECRET` — Vercel 側と同一値

## Web Push のセットアップ

VAPID 鍵を生成 (1 度だけ):

```bash
npx web-push generate-vapid-keys
```

公開鍵を `NEXT_PUBLIC_VAPID_PUBLIC_KEY`、秘密鍵を `VAPID_PRIVATE_KEY` として
Vercel 環境変数に設定します。`VAPID_SUBJECT` には連絡先 `mailto:...` を、
`PUSH_DISPATCH_SECRET` には十分なエントロピを持つランダム文字列を設定:

```bash
openssl rand -hex 32
```

iOS Safari は PWA を「ホーム画面に追加」した状態でのみ Web Push に対応します
(iOS 16.4 以降)。`/settings` の通知 UI は標準ブラウザでは「ホーム画面に追加してください」
と案内します。

`config/site.ts` のサイト名・カラーは中立色 (`#475569` slate) で江東区シンボル色を避けています。

## PWA アイコンの生成

`public/icons/` 以下の PNG アイコンはプレースホルダです。外部依存なしの純 Node.js スクリプトで生成:

```bash
node scripts/generate-icons.mjs
```

本番用アイコンに差し替える場合は、192x192 と 512x512 の PNG を用意して
`public/icons/` に配置してください (maskable 版は同サイズで安全ゾーン 80% 対応)。

## `--ignore-scripts` の運用例外

`.npmrc` に `ignore-scripts=true` を設定しています。
ネイティブアドオンのビルドが必要なパッケージを追加する際は、
`can-i-ignore-scripts` ツールでレビューし、README に個別許可の記録を残してください。

現在の例外: なし

## 既知の上流依存脆弱性 (build-time のみ)

`npm audit --audit-level=high` で以下が報告されますが、いずれも **build-time 依存** で
ランタイム実行パスに含まれません。アップストリームの修正待ち:

| パッケージ | 経路 | 重大度 | 状況 |
|---|---|---|---|
| `postcss<8.5.10` | `next` 内部 | moderate (XSS) | `next` 側で固定。`audit fix --force` は next を 9.x にダウングレードするため適用不可 |
| `serialize-javascript<=7.0.4` | `@ducanh2912/next-pwa` → `workbox-build` → `@rollup/plugin-terser` | high (RCE) | SW バンドル生成時のみ使用。ユーザー入力経路を通らない |

`npm audit --audit-level=critical` は pass。フェーズ 2 で `next-pwa` の代替検討。

## 観測性ツール導入の判断条件

Sentry / Vercel Analytics 等の観測性ツールを導入する場合は、以下をすべて満たすこと:

1. PII フィルタ設定を ON にすること
2. ユーザーへの同意 UI を実装すること
3. CSP `connect-src` に当該ドメインを追加すること (`lib/csp.ts` を更新)
4. `/privacy` ページを更新すること

## フェーズ 2 ロードマップ

リリース後の改善項目:

1. **kill switch** — 一定期間更新が停止した場合に Service Worker から `/maintenance` に
   リダイレクトする運用継続性対策
2. **PR 単位の test/lint workflow CI** — 現状 `data-sync` のみ MVP。フェーズ 2 で
   GitHub Actions に Vitest / lint / build / `npm audit` を追加
3. **Lighthouse CI** — Performance/Accessibility/PWA スコアの継続監視
4. **CSP report-uri / report-to** — 観測性ツール導入と合わせて違反検知を有効化
5. **PMTiles 経由の GSI ベクトルタイル** — 描画品質向上 (現状はラスター)
6. **WBGT (暑さ指数)** — 環境省データの日次バッチ取得を `/weather` 画面に統合
7. **OSM タイル/データの地理範囲拡大** — 23 区から多摩地域・隣接 3 県へ拡大検討

## ライセンス

ソースコードのライセンスは `LICENSE` を参照。
データソースのライセンスは「データソース・ライセンス」セクションを参照。

## 技術スタック

- **Framework**: Next.js 15 (App Router) + TypeScript
- **UI**: Tailwind CSS v4
- **Map**: MapLibre GL JS + 国土地理院標準地図 (raster)
- **Schema/Validation**: Zod
- **State**: React Server Components + LocalStorage allowlist (`config/storage.ts`)
- **Persistence (Edge)**: Vercel KV (`@vercel/kv`)
- **Test**: Vitest + Testing Library + vitest-axe
- **Hosting**: Vercel (Hobby)
