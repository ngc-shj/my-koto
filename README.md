# My こうとう (非公式)

**このサービスは江東区の公式サイトではありません。**

江東区民が日常的に使う行政情報（ゴミ収集、AED、公衆トイレ、区主催イベント、天気、
気象警報・地震、都営バス時刻表など）を一画面に集約した非公式 PWA です。
江東区・東京都・各データ提供元は本サービスとは無関係です。

## 主な機能

- **ホームバナー (気象警報・地震)** — JMA bosai フィードから江東区に発表中の警報
  / 特別警報、および直近 24h で江東区が震度 2 以上を観測した地震をホーム上部に
  バナー表示。クリックで `/weather` の詳細パネルへ
- **ゴミ収集カレンダー** — 公式 CSV (CC-BY 4.0) を取り込んだ 58 区分の収集ルートに対応。
  地区検索、月次/週次/当日・翌日ビュー、`webcal://` 購読 (UA 判定で iOS は webcal、他は https)
- **ゴミ品目検索** — wanakana を使った NFKC + ひら↔カナ + ローマ字 双方向の正規化検索。
  「ペットボトル」「ぺっとぼとる」「PET」「ﾍﾟｯﾄﾎﾞﾄﾙ」が同一結果
- **区民マップ (14 レイヤ + 検索)** — AED (246) / 公衆トイレ (191) / 公園 (171) /
  図書館 (12) / 児童館 (18) / 区立保育園 (43) は江東区公式、避難所 (193) /
  避難場所 (12, 8 種ハザード対応フラグ付) / 給水拠点 (6) は東京都公式。
  追加で OSM-only レイヤ: 駅・地下鉄出入口 (transit カテゴリ)、病院・診療所・薬局
  (medical カテゴリ)。レイヤ抽象 (`lib/map/registry.ts`) で同一の toggle UI /
  マーカー描画 / OSM Overpass フォールバックを共有し、`bundled` フラグで
  Koto-bbox dedupe を制御。レイヤパネルに POI 名・住所の部分一致検索と
  件数バッジを実装。低ズーム時はピクセルグリッドで自動クラスタリング
- **バス時刻表** — 都営バス GTFS-JP (CC-BY 4.0) から江東区を通る 68 系統 ×
  879 停留所を bundled JSON (3.3 MB) に取込。停留所名で部分一致検索 →
  通る系統の方向別時刻表へ展開。江東区コミュニティバス「しおかぜ」(江東01) は
  同梱データに含まれており、ルートエイリアスで識別。アクティブ
  プロファイルの district label (丁目除去後) で初期検索値をプリセット
- **イベントカレンダー + ICS + 検索** — `ical-generator` + `@touch4it/ical-timezones`
  で VTIMEZONE 同梱、`STATUS:CANCELLED`、全テキストフィールドのエスケープ、
  URL は https only。タイトル / 場所 / 主催 / 説明にまたがる検索フィルタを実装
- **天気** — Open-Meteo を Edge proxy で取得、Vercel KV に stale-if-error キャッシュ、
  60 req/min/IP のレート制限、SSRF ハードニング (GET 限定 / redirect:'manual' / Zod 検証 /
  ヘッダ strip)
- **気象警報・注意報 (江東区)** — JMA `bosai/warning/data/warning/130000.json` を
  Edge proxy で取得、`areaTypes[1]` から江東区 (class20s 1310800) のみ抽出、
  警報コードを日本語ラベル + tier (特別警報 / 警報 / 気象情報 / 注意報) に解決。
  KV TTL=60s、stale-if-error 1h
- **地震情報 (江東区震度ハイライト)** — JMA `bosai/quake/data/list.json` の最新 10 件を
  Edge proxy で正規化、江東区 (city.code 1310800) で観測された震度をイベントごとに
  突合せ。KV TTL=5min、stale-if-error 24h
- **WBGT (暑さ指数)** — 環境省 熱中症予防情報サイトの予測 CSV (東京観測所 44132)
  を Edge proxy で取得・パース。注意 / 警戒 / 厳重警戒 / 危険のバンドで色分けし
  6 時点先まで `/weather` に表示。30 分 KV キャッシュ + stale-if-error
- **PWA** — Service Worker (build ID 付き cache name)、機内モードで `/offline`、
  Vercel preview では manifest を 404 にして本番との混同を防止
- **プッシュ通知 (Web Push)** — 翌日のごみ収集を前日の指定時刻 (JST 18-22 時)
  に通知。設定画面でオプトイン制。VAPID 鍵で署名、購読情報は Vercel KV に
  保存。配信は GitHub Actions cron (`.github/workflows/push-dispatch.yml`)
  から `/api/push/dispatch` を叩く方式 (Vercel Hobby は cron が日次までのため)
- **CSP** — 本番は `script-src 'self' 'nonce-XXX' 'strict-dynamic'` (unsafe-eval/inline なし)。
  middleware で nonce を生成 (`crypto.getRandomValues`、128bit Base64URL)。
  HSTS / COOP / CORP / Permissions-Policy 全て付与。`report-to` + `report-uri`
  で違反を `/api/csp-report` に集約 (URL クエリ削除・UA はブラウザ名のみに正規化、
  Vercel KV LIST 直近 50 件保持)
- **観測性ダッシュボード `/status`** — 各データセットの最終更新時刻 (mtime)、
  Push 配信 cron の直近実行サマリ (試行/成功/失効/失敗の件数)、CSP
  違反レポートの直近 50 件を 1 ページに集約。運用者向け、ユーザ向けナビ非掲載

## データソース・ライセンス

| データ | 提供元 | ライセンス |
|--------|--------|-----------|
| ゴミ収集・AED・公衆トイレ・イベント | 東京都・江東区 ([東京都オープンデータカタログ](https://catalog.data.metro.tokyo.lg.jp/dataset?organization=t131083)) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 避難所・避難場所 | 東京都総務局 ([東京都防災マップ 避難所・避難場所一覧](https://catalog.data.metro.tokyo.lg.jp/dataset/t000003d0000000093)) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 給水拠点 | 東京都水道局 ([給水拠点一覧](https://catalog.data.metro.tokyo.lg.jp/dataset/t000019d0000000001)) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 23 区内マップレイヤ補完データ (駅・出入口・病院・診療所・薬局を含む) | [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) | ODbL |
| 都営バス GTFS-JP (江東01「しおかぜ」を含む) | 東京都交通局 ([ODPT 経由](https://ckan.odpt.org/dataset/b_bus_gtfs_jp-toei)) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 気象警報・注意報 / 震源・震度情報 | [気象庁 防災情報](https://www.jma.go.jp/bosai/) | [気象庁ホームページ コンテンツの利用について](https://www.jma.go.jp/jma/kishou/info/coment.html) (出典明示で利用可) |
| 天気予報 | [Open-Meteo](https://open-meteo.com) | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| WBGT (暑さ指数) | [環境省 熱中症予防情報サイト](https://www.wbgt.env.go.jp/) | [出典明示の上で利用可](https://www.wbgt.env.go.jp/sp/index_pre.php) |
| 地図タイル | [国土地理院 標準地図](https://maps.gsi.go.jp/development/ichiran.html) | 国土地理院コンテンツ利用規約 |

本サービスは上記オープンデータを一部加工して利用しています。

### 取得元 URI 一覧

`scripts/generate-pois.ts` および `scripts/generate-districts.mjs` が
fetch する CSV は以下の URI です。Tokyo Met dataset (避難所・避難場所・給水拠点)
は CKAN package_show API で resource URL を解決するため、ファイル名のローテーション
にスクリプト側が追従します。

| レイヤ / 用途 | 取得元 |
|---------------|--------|
| 江東区 ゴミ収集 (区域) | `https://www.city.koto.lg.jp/012107/documents/131083_kotocity_collection_district.csv` |
| 江東区 AED | `https://www.city.koto.lg.jp/012107/documents/131083_aed.csv` |
| 江東区 公衆トイレ | `https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_toilet.csv` |
| 江東区 公園 | `https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-17_parks.csv` |
| 江東区 図書館 | `https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-25_libraries.csv` |
| 江東区 児童館 | `https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-9_childrensclubhouses.csv` |
| 江東区 区立保育園 | `https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-10_municipal_childrens_daycare_centers.csv` |
| 東京都 避難所 (CKAN) | dataset `t000003d0000000093` → `evacuation_center.csv` |
| 東京都 避難場所 (CKAN) | dataset `t000003d0000000093` → `evacuation_area.csv` |
| 東京都 給水拠点 (CKAN) | dataset `t000019d0000000001` → `kyoten_<yyyymmdd>.csv` |
| 天気予報 | `https://api.open-meteo.com/v1/forecast` |
| 地図タイル (国土地理院) | `https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png` |
| OSM 補完 (Overpass) | `https://overpass-api.de/api/interpreter` |
| WBGT 予測 (環境省) | `https://www.wbgt.env.go.jp/prev15WG/dl/yohou_44132.csv` (東京観測所) |
| 都営バス GTFS-JP (ODPT 公開ミラー) | `https://api-public.odpt.org/api/v4/files/Toei/data/ToeiBus-GTFS.zip` |
| 気象警報・注意報 (気象庁) | `https://www.jma.go.jp/bosai/warning/data/warning/130000.json` (東京都) |
| 震源・震度情報 (気象庁) | `https://www.jma.go.jp/bosai/quake/data/list.json` |

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

# 区民マップ全レイヤ (江東区・東京都公式 CSV → data/{aed,toilet,shelter,assembly_point,water_supply}.json)
# Tokyo Met dataset の resource URL は CKAN API から実行時に解決する (filename ローテーション対応)
# `tsx` 経由で TypeScript を直接実行 (lib/csv.ts と parser 共有)
npx tsx scripts/generate-pois.ts

# 都営バス GTFS-JP → 江東区を通る系統に絞った data/bus-toei.json
# (`adm-zip` で zip 解凍、CSV をストリームパース)
npx tsx scripts/fetch-bus-toei.ts
```

## データ配信アーキテクチャ

`data/*.json` は **基本的にコミットしない** 方針で、生成は 2 系統に分かれます。

### 1. ランタイム取得 (Edge API + KV キャッシュ)

AED・公衆トイレ・イベント・ゴミ収集スケジュールは
`/api/datasets/{aed,toilet,events,gomi}` が CKAN から CSV を取得して KV に
キャッシュします。データ更新に再デプロイ不要。

- 上流: `catalog.data.metro.tokyo.lg.jp` の CKAN `package_show` で
  リソース URL を解決
- サーバー: Edge Runtime → Vercel KV (`DATASETS_CACHE`: ブラウザ 1h、共有 24h、
  SWR 7d、stale-if-error 7d) → クライアントへ
- SSR ページ (`/`, `/events`, `/map`) は同じ lib (`lib/opendata/datasets/`) を
  直接呼び、`export const revalidate` で ISR

### 2. ビルド時生成 (`scripts/ensure-data.mjs`)

更新頻度が低い静的データは `predev` / `prebuild` / `pretest` フックで
`scripts/ensure-data.mjs` が `data/` を埋めます。9 ファイルすべて gitignore。

| ファイル | 生成スクリプト | 上流 |
|---|---|---|
| `districts.json` | `generate-districts.mjs` | 江東区公式 CSV |
| `{shelter,assembly_point,water_supply}.json` | `generate-pois.ts` | 東京都 CKAN |
| `{park,library,child_center,nursery}.json` | `generate-pois.ts` | 江東区公式 CSV |
| `bus-toei.json` | `fetch-bus-toei.ts` | 都営バス GTFS-JP |

`ensure-data.mjs` は既存ファイルがあれば即 exit するので、2 回目以降の
`npm run dev` / `npm test` はゼロコスト。初回 clone / Vercel ビルドだけ
30〜60 秒の生成時間が発生します。`__fixtures__/opendata/` に CSV キャッシュが
コミットされているのでローカルは概ね数秒で済みます。

### 3. キュレーション (commit)

上流のない、人が手で書く資料は引き続き git で管理します。

- `data/gomi-dictionary.json` — ゴミ品目辞書
- `data/gomi-schedule.json` — 特殊収集日のオーバーレイ

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
4. ~~**CSP report-uri / report-to** — 観測性ツール導入と合わせて違反検知を有効化~~
   → `/api/csp-report` + `/status` で対応済
5. **PMTiles 経由の GSI ベクトルタイル** — 描画品質向上 (現状はラスター)
6. **OSM タイル/データの地理範囲拡大** — 23 区から多摩地域・隣接 3 県へ拡大検討
7. **救急当番医・休日急患診療所** — 東京都救急医療情報センターのライブデータ調査、
   江東区休日急患診療所の固定エントリ追加
8. **行政手続きガイド** — 転入・転出・各種申請のステップ、必要書類、窓口の混雑時間
9. **ODPT リアルタイム** — 都営バスの位置情報。`acl:consumerKey` を Vercel 環境変数に
   セットして `/api/bus/realtime` を Edge route で実装

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
