# Koto-MVP Plan: 江東区版「My こうとう」(仮) PWA 構築

作成日: 2026-05-04

## Project context

- **Type**: web app (PWA)
- **Test infrastructure**: unit tests only (新規プロジェクトのため Vitest を最初から導入。E2E / CI は MVP スコープ外)
- **Hosting**: Vercel (個人運用)
- **Repository visibility**: 非公開 (デプロイのみ公開)
- **Reference site**: [My はんのう](https://city.tecoli.com/hanno/) — 飯能市の非公式生活支援 PWA。江東区版の機能セットはここを基準とする。

## Objective

江東区民が日常的に使う行政情報（ゴミ収集、AED、公衆トイレ、区主催イベント、天気）を一画面に集約し、Google/Apple カレンダー連携・PWA インストールで「家族の生活インフラ」として常用できる非公式サイトを公開する。

非目標: 公式サイトの代替を装うこと、収益化、アカウント機能、双方向通信、行政手続きの代行。

## Requirements

### 機能要件 (MVP)

1. **ゴミ収集カレンダー**
   - 江東区内の地区を選択 → 当日・翌日・週間の収集品目を表示
   - LocalStorage に選択地区を保存 (初回のみ選択画面)
   - 月次カレンダービュー (収集日に品目アイコン)

2. **ゴミ品目検索**
   - インクリメンタル検索（前方・部分一致）
   - 検索結果に「分別区分 / 出し方 / 注意事項」を表示
   - ひらがな・カタカナ・漢字を区別せずヒットする正規化

3. **AED / 公衆トイレマップ**
   - 地図表示 (MapLibre GL JS + 国土地理院ベースタイル or OpenStreetMap)
   - 現在地ピン + 近距離順ソート
   - フィルタ: AED / トイレ / バリアフリー / 24h
   - 詳細パネル: 名称・住所・備考・Google Maps リンク

4. **イベントカレンダー**
   - 区主催イベントの直近 30 日を一覧
   - 月次カレンダービュー
   - 詳細パネルから ICS ダウンロード or サブスクリプション URL コピー
   - Google/Apple Calendar への購読リンク

5. **天気・暑さ指数**
   - 江東区中心点 (緯度経度 35.6727, 139.8175) の天気を Open-Meteo から取得
   - WBGT (暑さ指数) は環境省 暑さ指数公開システムから取得 — 公開更新は **1 日 3 回 (5 時/14 時/17 時)** と公式に明示されているため、動的プロキシではなく **`data/wbgt.json` に日次バッチで取得** する設計に変更
   - 当日・翌日の最高/最低気温・降水確率・WBGT

6. **PWA / インストール**
   - manifest.json + Service Worker (next-pwa or workbox-webpack-plugin)
   - オフライン: ゴミ収集データ・品目辞書・施設リストはキャッシュ
   - ホーム画面追加対応

7. **共有機能**
   - URL 共有 (Web Share API + フォールバック)
   - 各機能のディープリンク (`/gomi`, `/gomi/search`, `/map`, `/events`, `/weather`)

### 非機能要件

- **アクセシビリティ**: WCAG 2.1 AA 相当。コントラスト比、キーボード操作、スクリーンリーダー対応
- **パフォーマンス**: LCP < 2.5s、CLS < 0.1、JS バンドル初回 < 200KB gzip
- **i18n**: 日本語のみ (MVP)。文字列はキー化して将来拡張に備える
- **プライバシー**: 行動追跡しない、ユーザー設定はすべて LocalStorage、外部 API は天気・地図タイル・WBGT のみ
- **法的明示**: 各画面フッタに「このサイトは江東区の公式サイトではありません」「江東区・東京都が提供するオープンデータを CC-BY 4.0 のもとで利用」と明記

## Technical approach

### スタック

- **Framework**: Next.js 15 (App Router) + TypeScript
- **UI**: Tailwind CSS + shadcn/ui (アクセシビリティ対応の Radix 系)
- **State**: React Server Components + URL 状態 + LocalStorage (Zustand 等は MVP では入れない)
- **Map**: MapLibre GL JS + **国土地理院ベクトルタイル** (`https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf`) を一次選択。利用規約は [地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html) を実装初日に再確認し、商用判定不要の用途であることを `config/map.ts` に記録。OSM raster は [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) で大規模 PWA 直叩きが禁止されているため使用しない。バックアップ候補: MapTiler 無料枠 / Protomaps セルフホスト
- **Date**: date-fns + date-fns-tz (Asia/Tokyo)
- **ICS**: `ical-generator` + `ical-timezones` (VTIMEZONE 同梱対応のため `ics` から変更)
- **Schema**: Zod (オープンデータ正規化・上流レスポンス検証)
- **PWA**: `@ducanh2912/next-pwa`
- **Persistence (Edge)**: Vercel KV (`@vercel/kv` SDK)。上流障害時の最終成功レスポンス保持・分散レート制限カウンタを担う。Hobby 枠で運用可能。`lib/proxy.ts` の `interface KVStore { get / set / incr / expire }` 経由で抽象化し、本番は `@vercel/kv` 薄アダプタ、テストは In-memory Map 実装に注入できるようにする (Upstash Redis への切替パスも同 interface で確保)
- **Test**: Vitest + Testing Library + `vitest-axe` (主要画面の WCAG 違反 0 件を継続検証)
- **Lint/Format**: ESLint (next/core-web-vitals) + Prettier
- **Hosting**: Vercel (Hobby プラン)
- **Dependency hygiene**: lockfile 必ず commit、Renovate (週次 + security alert 即時)、`npm audit --audit-level=high` を pre-deploy、主要依存はバージョン固定 (`=`)、`npm ci --ignore-scripts`

### データ取得・同梱戦略

- **静的同梱 (ビルド時/日次取得)**:
  - ゴミ収集スケジュール (年間)
  - ゴミ分別品目辞書
  - AED 設置箇所一覧
  - 公衆トイレ一覧
  - 区主催イベント (ビルド時点での未来 90 日分)
  - **暑さ指数 WBGT** (環境省は 1 日 3 回更新のため、日次バッチで `data/wbgt.json` に取得して同梱)
- **動的取得 (Edge proxy 経由)**:
  - 天気 (Open-Meteo / Edge proxy で取得、キャッシュ 1h)
  - **動的プロキシは天気のみ** (WBGT は静的同梱に変更)
- **Edge proxy ハードニング** (`/api/weather`):
  - HTTP メソッド制限: `GET` 以外は 405
  - 上流 fetch は `redirect: 'manual'` (30x SSRF を遮断)、`signal: AbortSignal.timeout(5000)` (タイムアウト)
  - 入力パラメータ受け付けない (緯度経度は `config/geo.ts` の固定値)
  - 上流 URL は `config/proxy-allowlist.ts` のホスト集合と `new URL().hostname` の厳密一致を再検証
  - 上流レスポンスの `Content-Type` 許可リスト (`application/json` のみ) と Content-Length の上限 256KB
  - 上流レスポンス body は Zod スキーマで shape 検証 → 不正なら 502
  - 上流に転送するヘッダは `User-Agent` (固定値) と `Accept` のみ。`X-Forwarded-For` / `X-Real-IP` / `Cookie` / `Authorization` は新規 `Headers()` 構築で確実に除外
  - レスポンスヘッダ: `Cache-Control: public, s-maxage=3600, stale-if-error=86400` / `Vary: Accept-Encoding` / `Access-Control-Allow-Origin` は自サイトのみ
  - 上流成功時に Vercel KV に書き込み、上流失敗時は KV から読み出して `stale-if-error` で配信。Vercel CDN キャッシュは TTL ベースのため別途 KV を併用
  - レート制限 (S18 強化): Vercel KV の `INCR + EXPIRE` で IP ベース 60 req/min/IP の分散カウンタ。超過時は `429 Too Many Requests` + `Retry-After`。Hobby プランで動作する設計とし、`@vercel/firewall` Bot Protection は Pro 限定のため採用しない
    - **IP 取得は `@vercel/functions` の `ipAddress(req)` または `request.ip` を使用**。クライアント送信の `X-Forwarded-For` を直接信頼しない (バイパス防止)。XFF が複数値の場合は Vercel エッジが付与する末尾を採用、フォールバックは `0.0.0.0` (キーが取れない場合は 1 バケットに集約)
    - 受入確認: `curl -H "X-Forwarded-For: 1.2.3.4"` を任意値で繰り返してもレート制限が 60 req 以降で発動すること
    - **KV 障害時の挙動** (S31): `INCR` が失敗したら process-local LRU (例: `lru-cache`) で低精度フォールバック (完全 bypass を防ぐ) + Discord 通知。fail-open ではなく fail-degraded を選択。実装は `lib/proxy.ts` の `KVStore` 障害時パスにラップ
  - **KV キー設計** (S20): キー名空間は `weather:v${SCHEMA_VERSION}:${path}` でスキーマバージョン込み。Zod 変更時は別 namespace に分離。KV 読み出し時にも Zod 再検証し、失敗なら `503` を返す (古い不正値の伝播防止)。値サイズ上限 64KB
  - 未知のクエリパラメータは無視。キャッシュキーは path のみ
- **`/api/ics/gomi/[district]/route.ts` の動的パラメータ検証** (S19 強化):
  - 二段階検証: (1) 文字種制限 `/^[a-z0-9-]{1,32}$/.test(input)` (Unicode 同形異義・ダブルエンコード対策) → (2) `config/districts.ts` allowlist の case-sensitive 厳密一致 → どちらか NG で 404
  - 検証ケース: `..` / `%2e%2e%2fadmin` / キリル `о` を含む文字列 / 大文字 / 空文字をすべて 404
- **ICS のテキストフィールドエスケープと URL scheme 検証** (S17 強化):
  - RFC 5545 text 値 (SUMMARY / DESCRIPTION / **LOCATION** / **COMMENT** / **CATEGORIES**) 全てに `,` `;` `\` 改行のエスケープを適用
  - `URL` プロパティは `https:` スキームのみ許可。Zod `refine(u => new URL(u).protocol === 'https:')` で検証、不適合は省略
  - Vitest ネガティブテスト: LOCATION に `\r\nBEGIN:VEVENT` を含む入力で event injection が起きないこと
- **更新パイプライン**:
  - GitHub Actions の cron (毎日 03:00 JST) でオープンデータと WBGT を取得 → Zod 正規化 → 検証 → **必ず PR ベース** (auto-commit は禁止) で `peter-evans/create-pull-request` を使用
  - 検証失敗時: 旧 `data/*.json` を保持してスクリプトは非ゼロ終了。Discord webhook で通知。`data/` には書き込まない
  - workflow 設定: `permissions: { contents: write, pull-requests: write }` の最小スコープ。`concurrency` と `timeout-minutes: 10` を設定
  - User-Agent: `koto-city-bot/1.0 (+https://<domain>/about)` (個人メールアドレス非含有、連絡先は about ページ経由)
  - secrets: `DISCORD_WEBHOOK` は GitHub Secrets。ログに echo しない

### データソース (確認済み)

東京都オープンデータ API カタログ (江東区組織) より JSON/XML 取得可能。すべて [CC-BY 4.0](https://portal.data.metro.tokyo.lg.jp/terms)。データセット ID は計画段階で実機確認済み (2026-05-04 時点)。

| 機能 | データセット | データセット ID (最新) | 形式 | 最終更新 |
|---|---|---|---|---|
| ゴミ収集 | 資源回収・ごみ収集日一覧 | `t131083d3100000009-671838441b8036aa352b967b5514a545` | JSON/XML | 2024-12-01 |
| AED | AED設置箇所一覧 | `t131083d0000000027` | JSON/XML | (要詳細確認) |
| トイレ | 公衆トイレ一覧 | `t131083d0000000019` | JSON/XML | (要詳細確認) |
| イベント | イベント一覧 | `t131083d0000000017-252a3033bb76c746c8ee30c24a3a2b5a-0` | JSON/XML | (要詳細確認) |
| 品目検索 | ゴミの分別方法一覧 | (実装初日に確定。検索キーワード「分別」「資源化」で再探索) | JSON/XML | — |
| WBGT | 暑さ指数 (環境省) | `https://www.wbgt.env.go.jp/wbgt_data_download.php` 経由で東京エリア観測地点コードを実装初日に確定 | CSV | 1 日 3 回 |

**地区マスタ (district master)**:
- 江東区の収集地区粒度 (町丁目単位 / 大字 / 収集ルートコード) を計画段階で API レスポンスから抽出する
- `data/districts.json` のスキーマ:

  ```ts
  type District = {
    id: string;            // 一次キー (例: "kameido-1"、ASCII slug、/^[a-z0-9-]+$/)
    label: string;         // 表示用 (例: "亀戸 1 丁目")
    addresses: string[];   // 該当する町丁目の正規表現または完全名リスト
    schedule: WeeklySchedule; // 各収集品目の通常週次 (例: 燃やすごみ: ['mon','thu'])
  };
  ```

- 責務分割 (F21 解消):
  - `data/districts.json`: **通常週次** (繰り返しの曜日パターン)
  - `data/gomi-schedule.json`: **特別日程 overlay** (祝日・年末年始の上書き、月次で平常週次に対する追加・除外イベント)
  - 月次カレンダービュー描画時は districts → gomi-schedule の順で重畳
- 住所→地区マッピングは町丁目までの完全一致 + 表記ゆれ正規化 (NFKC + 全/半角統一)
- 不明住所は「お住まいの町丁目を一覧から選択」モーダルにフォールバック

**データセット ID 確定の進め方** (Critical F1 解消):
- 上記の確認済みデータセットは plan に固定値として記載済み。実装着手後に各 API のレスポンスを取得して `__fixtures__/opendata/*.json` に保存し、Zod スキーマと突き合わせる
- 「ゴミの分別方法一覧」は当該カタログでの命名が異なる可能性 (例: 「ゴミ分別辞書」「資源化メニュー」) があるため、実装初日にキーワード再探索を行い、見つからない場合は他自治体 (例: 横浜市の CC0/CC-BY 辞書) の流用可否を確認
- 「公式 PDF からのスクレイピング」は **使わない**。API が見つからない品目辞書のみは、他自治体辞書の流用または手動メンテナンスにフォールバック (`out of scope` の自家撞着を解消)

### 帰属表示と誤認防止 (CC-BY 4.0 義務)

CC-BY 4.0 は (i) 著作者名 (ii) 著作物名 (iii) ライセンス URL (iv) 改変表示 (v) 元著作者の支持を受けた印象を与えない、を要求する。フッタだけでは個別画面 (ICS DESCRIPTION, AED 詳細, JSON エクスポート, OG 画像) で帰属が剥がれるため、**構造化して全レンダラから強制参照** する。

- `config/attribution.ts` に各データセットの「dataset_name / copyright_holder / license_url / modified: boolean」を構造化保存
- `<Attribution dataset="..." />` コンポーネントを各機能画面・モーダル・ICS 生成箇所で必ず参照
- ICS の `DESCRIPTION` / `URL` プロパティに帰属とソース URL を含める
- OG 画像は「非公式」ウォーターマークと「Based on data by 東京都・江東区 (CC-BY 4.0)」を含めて生成
- PWA `manifest.json` の `name` / `short_name` を「My こうとう (非公式)」と明示
- 全ページ `<head>` に `<link rel="license" href="https://creativecommons.org/licenses/by/4.0/deed.ja">`
- `/about` ページを実装初日に作成し、誤認回避声明・著作権者リスト・ライセンス・運営者情報を集中明示

帰属文言テンプレ (CC-BY 4.0 改変ありの場合):

> 出典: 「<データセット名>」、東京都・江東区 (一部加工して利用)、[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)
> 天気: [Open-Meteo](https://open-meteo.com) (CC-BY 4.0)
> 暑さ指数: [環境省熱中症予防情報サイト](https://www.wbgt.env.go.jp/) (出典明示利用)
> 地図タイル: 「[地理院タイル (国土地理院)](https://maps.gsi.go.jp/development/ichiran.html)」

### セキュリティヘッダ (CSP / HSTS / Permissions-Policy)

`next.config.ts` の `headers()` で全レスポンスに以下を返す。**CSP は環境分岐で本番から `'unsafe-eval'` を除外、`script-src` の `'unsafe-inline'` は nonce 化** (S16 対応)。

本番 CSP (`process.env.NODE_ENV === 'production'`):

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
  style-src 'self' 'unsafe-inline';   # Tailwind の generated style 用
  img-src 'self' data: https://cyberjapandata.gsi.go.jp;
  connect-src 'self' https://api.open-meteo.com https://cyberjapandata.gsi.go.jp;
  font-src 'self' data:;
  worker-src 'self' blob:;            # next-pwa の SW 登録用
  manifest-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
```

開発 CSP (`development`): `script-src 'self' 'unsafe-inline' 'unsafe-eval'` を例外的に許可 (Next.js dev runtime の都合)。本番ビルドへ漏らさないことを Step 1 受入で `curl -I` 検証する。

`middleware.ts` でリクエスト毎に nonce を生成し、`script-src 'nonce-${nonce}' 'strict-dynamic'` でインラインスクリプトをホワイトリスト化。nonce 化完了は **Step 9** で達成 (移行ロードマップ固定)。

**nonce 生成の暗号強度** (S33): `crypto.getRandomValues(new Uint8Array(16))` で 128bit 以上を生成し Base64URL エンコード。`Math.random()` ベース実装は使用禁止。実装ミスを防ぐため `lib/csp.ts` に `generateNonce()` ヘルパを集中化。

その他の固定ヘッダ:

```text
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
Permissions-Policy:
  geolocation=(self), camera=(), microphone=(), payment=(), usb=(),
  clipboard-write=(self), clipboard-read=(),
  bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(),
  interest-cohort=(), browsing-topics=()
```

### Geolocation 同意 UI とプライバシー

- 位置情報を要求する直前にアプリ独自の「目的・送信しないこと・端末内のみで利用」説明モーダルを出す (ブラウザ標準プロンプトの前段)
- 取得した座標は LocalStorage / Cookie に保存しない (関数スコープのみ)
- `/api/weather` は `config/geo.ts` の固定座標 (江東区中心) を使用していることを UI に明示
- プライバシーポリシーページ `/privacy` を独立ルートで作成し、Geolocation API の取り扱い・送信されないことを記載

### LocalStorage / IndexedDB 用途境界

- `config/storage.ts` に「LocalStorage に保存可能な key allowlist と型」を定義 (例: `district_id`, `theme`)
- PII / 健康情報 / 財務情報は LocalStorage に **入れない** 方針を README + プライバシーポリシーに明記
- オフライン用の公開データ (AED 一覧、トイレ一覧、ゴミ収集スケジュール) は IndexedDB に分離

### Service Worker キャッシュ戦略

- cache name に build ID を付与: `koto-city-v${process.env.NEXT_PUBLIC_BUILD_ID}`
- `activate` イベントで旧 cache を全削除
- `skipWaiting()` + `clients.claim()` で迅速更新
- `/api/weather` は SW でキャッシュしない (Edge cache に集約)
- 静的同梱データには `lastModified` を埋め込み、UI で「データ取得日: YYYY-MM-DD」を表示
- 一定期間更新が止まった場合の kill switch は MVP+1 (運用継続性リスクへの対策)

### 誤情報リスク (健康・生命) UX 担保

- 各データ表示の近傍に「最終更新: YYYY-MM-DD HH:MM JST」「公式サイトでご確認ください」固定文言を表示
- データ取得日が古い場合は警告バナーを表示:
  - AED: 30 日超で警告
  - ゴミ収集: 7 日超で警告
  - WBGT: 6 時間超で警告 (環境省更新は 1 日 3 回のため実害が少ない閾値に設定)
- AED 詳細パネルに「119 番への通報を最優先」を固定文言で表示
- WBGT が「警戒」以上のとき環境省公式への直接リンクを優先表示
- `/disclaimer` ページを独立ルートで作成し、フッタ・OG・README から参照

### ディレクトリ構成 (案)

```text
koto-city/
├── app/                       # Next.js App Router
│   ├── page.tsx               # トップ
│   ├── gomi/page.tsx          # ゴミ収集カレンダー
│   ├── gomi/search/page.tsx   # 品目検索
│   ├── map/page.tsx           # AED/トイレマップ
│   ├── events/page.tsx        # イベントカレンダー
│   ├── weather/page.tsx       # 天気
│   ├── settings/page.tsx      # 設定 (地区変更、通知有無、Cookie 不使用宣言)
│   ├── about/page.tsx         # 著作権者・ライセンス・運営者
│   ├── privacy/page.tsx       # プライバシーポリシー
│   ├── disclaimer/page.tsx    # 免責事項 (健康・生命情報の限界)
│   ├── offline/page.tsx       # PWA オフラインフォールバック
│   ├── not-found.tsx          # 404
│   ├── error.tsx              # 500 系エラーバウンダリ
│   ├── robots.ts              # robots.txt 生成
│   ├── sitemap.ts             # sitemap.xml 生成
│   ├── api/
│   │   ├── ics/events/route.ts        # 動的 ICS (events)
│   │   ├── ics/gomi/[district]/route.ts # 動的 ICS (district allowlist 検証)
│   │   └── weather/route.ts           # Open-Meteo proxy + KV cache + rate limit
│   └── layout.tsx
├── components/
│   ├── Attribution.tsx        # CC-BY 帰属表示 (各画面で必ず参照)
│   ├── DataFreshness.tsx      # 「最終更新」表示 + 警告バナー
│   └── GeolocationConsent.tsx # アプリ独自の同意モーダル
├── config/                    # 集中管理 (R2 対策)
│   ├── site.ts                # サイト名・テーマ色 (中立色)
│   ├── geo.ts                 # 江東区中心座標・Asia/Tokyo
│   ├── opendata.ts            # データセット ID と取得 URL (カタログ用)
│   ├── proxy-allowlist.ts     # Edge proxy の上流ホスト allowlist (セキュリティ用、責務分離)
│   ├── map.ts                 # タイル URL + attribution (国土地理院ベクトル)
│   ├── districts.ts           # 地区 allowlist (ICS dynamic route 検証)
│   ├── attribution.ts         # 帰属表示の構造化データ
│   └── storage.ts             # LocalStorage key allowlist と型
├── data/                      # ビルド時生成データ (commit 対象)
│   ├── districts.json         # 地区マスタ
│   ├── gomi-schedule.json
│   ├── gomi-dictionary.json
│   ├── aed.json
│   ├── toilet.json
│   ├── events.json
│   └── wbgt.json              # 日次取得 (環境省は 1 日 3 回更新のため動的不要)
├── lib/
│   ├── opendata/
│   │   ├── schemas/           # Zod スキーマ (aed/toilet/gomi/events/weather/wbgt)
│   │   ├── normalize.ts       # 正規化 + 値域チェック
│   │   └── weather.ts         # Open-Meteo クライアント (純関数、Vitest 容易)
│   ├── ics.ts                 # ical-generator ラッパ。now()/uuid() を引数注入で受ける
│   ├── search.ts              # 品目検索の正規化 (NFKC + かな↔カナ + 長音 + ローマ字)
│   ├── datetime.ts            # date-fns-tz の Asia/Tokyo 固定ヘルパ
│   ├── i18n/messages.ts       # `as const` object (型補完で「キー欠落 = ビルド失敗」)
│   └── proxy.ts               # Edge proxy 共通ラッパ (header strip, allowlist 検証, KV)
├── scripts/
│   ├── fetch-opendata.ts      # GitHub Actions から呼ぶ (PR 起票)
│   └── refresh-fixtures.ts    # 実 API レスポンスを __fixtures__/ に保存
├── __fixtures__/
│   └── opendata/              # 実 API のレスポンス (取得日時を README に記録)
├── public/
│   ├── manifest.json
│   └── icons/
└── .github/workflows/data-sync.yml
```

定数の集中管理ルール:
- 緯度経度・色・サイト名・タイムゾーン・API URL は `config/` 配下のみで定義し、各画面・API・スクリプトはここから import する。
- 同じ意味の値が 2 箇所以上に書かれていることをレビューでブロックする。
- `config/opendata.ts` (データセット ID) と `config/proxy-allowlist.ts` (上流ホスト) は責務を分離する (セキュリティ allowlist の意図しない拡大を防ぐ)。

## Implementation steps

各ステップは独立した PR/コミット粒度で進める。

1. **プロジェクト初期化 + セキュリティ基盤**
   - `git init` + `main` ブランチ + Vercel プロジェクト紐付け
   - Next.js 15 + TS + Tailwind + ESLint/Prettier セットアップ
   - **セキュリティヘッダ** (`next.config.ts` に CSP / HSTS / COOP / CORP / Permissions-Policy 等) 適用、CSP は環境分岐で本番から `unsafe-eval` 除外、`middleware.ts` で nonce 生成 (Step 9 で完了)
   - shadcn/ui 初期化、`<Attribution>` `<DataFreshness>` `<GeolocationConsent>` を **Client Component として分離** (T20 解消、vitest-axe 対象とする)、レイアウト・フッタ (法的明示・非公式声明) 実装
   - `/about` `/privacy` `/disclaimer` ルート作成 (集中明示の起点)
   - lockfile commit、Renovate (`renovate.json`) 設定。`npm ci --ignore-scripts` 環境で `npm run build` が success することを確認 (S25)。失敗依存があれば README に運用例外 (can-i-ignore-scripts レビュー後個別許可) を記録
   - 受入基準:
     - `npm run dev` でトップページが表示
     - `curl -I http://localhost:3000` で CSP / HSTS / COOP / CORP / Permissions-Policy ヘッダが返る (機械判定可)
     - 本番ビルド (`npm run build && npm run start`) の `curl -I` で CSP に `'unsafe-eval'` が含まれない (S16 解消の機械判定)
     - フッタに非公式声明・出典・ライセンス URL が表示される
     - `/about` `/privacy` `/disclaimer` がそれぞれ 200 で返る

2. **データ取得スクリプト + Zod スキーマ**
   - データセット ID は plan のテーブルに固定値で記載済み (実装初日は「ゴミの分別方法一覧」のみ再探索)
   - `lib/opendata/schemas/{aed,toilet,gomi,events,wbgt}.ts` に Zod スキーマ
   - `scripts/fetch-opendata.ts` の失敗ハンドリングを **純関数** で切り出し、Vitest で「不正レスポンス → 旧 `data/*.json` を上書きしない / 非ゼロ exit / Discord notifier が called」を assert (T18)。Discord webhook 自体は HTTP 境界としてモック
   - `scripts/refresh-fixtures.ts` で実 API レスポンスを `__fixtures__/opendata/` に保存
   - `.github/workflows/data-sync.yml`: cron 03:00 JST、`permissions: { contents: write, pull-requests: write }`、`peter-evans/create-pull-request` で PR 起票 (auto-commit 禁止)、`concurrency` + `timeout-minutes: 10`、UA は `koto-city-bot/1.0 (+/about)`
   - **Discord webhook ログマスク** (S26): workflow 冒頭で `echo "::add-mask::$DISCORD_WEBHOOK"`、失敗通知は同一日 1 回 (concurrency group + Actions cache でフラグ管理)
   - 受入基準:
     - `pnpm run fetch-opendata` が exit code 0 で完了し `data/*.json` が生成される
     - 各スキーマに対し `__fixtures__/{valid,invalid}.json` を Vitest で検証 (positive/negative)
     - 不正レスポンスを Vitest で再現し、旧 `data/*.json` 保持・非ゼロ exit・Discord notifier called を assert
     - GitHub Actions のローカル dry-run (`act`) で PR 起票プロセスが動作 (workflow 全体スモーク)
     - workflow log に `discord.com/api/webhooks/` の文字列が出力されない (`gh run view --log` で grep)

3. **ゴミ収集カレンダー + 地区マスタ**
   - `data/districts.json` の地区マスタを `config/districts.ts` の allowlist で参照
   - 地区選択 UI (`/gomi` 上のモーダル) と `/settings` での再選択 UI
   - LocalStorage は `config/storage.ts` の key allowlist 経由のみ
   - 当日・翌日・週次・月次ビュー (district の `schedule` + `data/gomi-schedule.json` の特別日程 overlay)
   - ICS 動的生成 (`/api/ics/gomi/[district]`、二段階検証: 文字種 + allowlist 厳密一致)
   - 受入基準:
     - Vitest で route handler に `district = "kameido-99"` (allowlist 外の合法文字列) を渡して 404
     - 手動 / framework: `/api/ics/gomi/../etc` `/api/ics/gomi/%2e%2e%2fadmin` `/api/ics/gomi/KAMEIDO-1` `/api/ics/gomi/` (空) ですべて 404
     - `webcal://` プレフィックス付き購読 URL が iOS Safari の PWA から動く (実機確認、手動)
     - クリップボードコピーは `webcal://`、ボタンの `href` は UA 判定で `webcal://` (iOS) と `https://` (それ以外) を選択 (F19 解消)
     - 月次ビューに通常週次 + 特別日程 overlay が反映されることを Vitest で assert

4. **ゴミ品目検索**
   - 正規化規則の確定: NFKC + ひらがな↔カタカナ + 長音正規化 + ローマ字対応 (採用ライブラリは `wanakana` を予定。確定後 plan に追記)
   - `__fixtures__/dictionary-labels.json` を実 API から抽出した代表 20 ラベルに対し、ひら/全カナ/半カナ/ローマ字/部分文字列の 5 入力でテーブル駆動テスト
   - 1 文字検索の結果数制限 + 絞り込みヒント
   - 受入基準: 「ペットボトル」「ぺっとぼとる」「PET」「ﾍﾟｯﾄﾎﾞﾄﾙ」が同一結果になる Vitest テストが緑

5. **AED/トイレマップ**
   - 国土地理院ベクトルタイル (`config/map.ts`) で MapLibre 初期化、`attributionControl` を CSS で消さない
   - `<GeolocationConsent>` で目的明示 → ブラウザ標準 prompt
   - 現在地拒否時は江東区中心にフォールバック + 住所検索フォールバック
   - フィルタ・近距離順ソート、詳細パネルに 119 番優先固定文言 (AED)
   - 受入基準: 単体テストで距離計算とフィルタ条件が assert される、地図描画は手動受入

6. **イベントカレンダー + ICS**
   - `lib/ics.ts` は `ical-generator` + `ical-timezones` で VTIMEZONE 同梱
   - `now()` `uuid()` を引数注入可能なシグネチャ (テストで決定論化)
   - 月次・リスト両ビュー、`STATUS:CANCELLED` 反映
   - サブスクリプション URL は `webcal://` プレフィックス、ダウンロードは `<a download>` + `Content-Disposition: attachment`
   - **データ反映経路** (F20 解消): 動的 ICS は build 時 `import data from '@/data/events.json'` で静的 import する設計とし、データ更新は data-sync workflow → PR → マージ → Vercel 本番ビルドで自動反映 (`revalidatePath` 不要、追加シークレット不要)
   - **テキストフィールド全エスケープ** (S17 解消): SUMMARY / DESCRIPTION / LOCATION / COMMENT / CATEGORIES に `,` `;` `\` `\n` エスケープを `lib/ics.ts` で適用。`URL` プロパティは Zod で `https:` のみ許可
   - 受入基準:
     - VTIMEZONE / STATUS:CANCELLED / 全テキストフィールドのエスケープ / CRLF / UID 決定論性 を Vitest で assert (構造化 assertion: 必須フィールド単位の正規表現/文字列チェック。snapshot は使わない、T16 解消)
     - LOCATION に `\r\nBEGIN:VEVENT` を含む入力で event injection が起きないネガティブテスト (S17)
     - icalendar.org/validator で初回 PASS (手動)
     - Apple Calendar (iOS) と Google Calendar で時刻が JST 表示される (手動)

7. **天気 (Edge proxy ハードニング)**
   - `lib/opendata/weather.ts` に純関数として URL 構築 + Zod 検証を切り出す (Vitest 容易)
   - `app/api/weather/route.ts` は薄いラッパで `lib/proxy.ts` 共通ラッパ経由
   - `lib/proxy.ts` で `interface KVStore { get / set / incr / expire }` を定義し、本番は `@vercel/kv` 薄アダプタ、テストは In-memory Map 実装に注入 (T15 解消)
   - ハードニング: GET 限定 / `redirect: 'manual'` / `AbortSignal.timeout(5000)` / Content-Type/Length 検証 / Zod / hostname 厳密一致 / ヘッダ strip
   - IP 取得は `@vercel/functions` の `ipAddress(req)` または `request.ip` (XFF 直接信頼禁止、S18)
   - Vercel KV: 上流成功時 SET、失敗時 GET (`stale-if-error=86400`)。読み出し時にも Zod 再検証、失敗で `503` (S20)
   - レート制限: KV `INCR + EXPIRE` で 60 req/min/IP、超過時 `429 + Retry-After`
   - WBGT は `data/wbgt.json` から静的読み出し (Edge proxy 不要)
   - 受入基準:
     - 純関数の Vitest テスト (URL 構築・hostname 検証・Zod 検証) 緑
     - route handler の Web 標準 Request/Response テストで `Cache-Control` ヘッダが正しい
     - クライアントから `?lat=` `?url=` を送っても上流 URL が変わらない (Vitest)
     - In-memory KVStore fake で「60 req OK / 61 回目 `429 + Retry-After`」を Vitest で assert (T17)
     - 同一 IP から 61 req/min でレート制限発動 (実機 / 手動 curl)
     - `X-Forwarded-For: 1.2.3.4` を任意値で送ってもレート制限がバイパスされない (実機 / 手動)

8. **PWA 化 + SW バージョニング**
   - `@ducanh2912/next-pwa` 導入
   - cache name に build ID、`activate` で旧 cache 全削除、`skipWaiting + clients.claim`
   - **manifest.json** (S27): `id: "/"`, `scope: "/"`, `start_url: "/"` 明示。Vercel preview deployment では manifest を 404 にして `noindex,nofollow` の robots と組み合わせ、preview を検索エンジン・PWA インストール対象から除外
   - `app/offline/page.tsx` を navigation fallback に登録
   - 静的データに `lastModified` 埋込み → `<DataFreshness>` で UI 表示
   - 受入基準:
     - Lighthouse PWA pass、機内モードで `/offline` 表示、新ビルドで旧 cache がクリア
     - SW 登録後 DevTools console に CSP 違反 (`SecurityError`) が出ない (S24)
     - SW 内 `importScripts` で読み込まれる workbox runtime が同一オリジン (`/_next/...`) であることを確認 (S30)
     - production と preview で manifest 配信が出し分けされる

9. **共有・SEO・アクセシビリティ + CSP nonce 完了**
   - OG 画像 (Edge `next/og`) に「非公式」ウォーターマーク + Based on data by 東京都・江東区 (CC-BY 4.0)
   - **OG 画像は静的生成または slug allowlist のみ受け付け** (S21)。動的題名は長さ上限 60 文字 + 文字種 allowlist を `lib/og.ts` で適用
   - Web Share API + フォールバック (iOS の files 未対応版に注意)
   - `app/robots.ts` `app/sitemap.ts` を Next.js metadata API で生成
   - **CSP nonce 化を完了**: `middleware.ts` で nonce を発行し、本番 `script-src` に `'nonce-${nonce}' 'strict-dynamic'` を適用。`'unsafe-inline'` を script-src から完全除外 (S16 ロードマップ完了点)。nonce 生成は `lib/csp.ts` の `generateNonce()` (CSPRNG) を使用 (S33)
   - `vitest-axe` で全公開ルート (`app/**/page.tsx` を glob で列挙) の WCAG 違反 0 件を確認 (T14 解消)
   - axe 対象は **Client Component に分離した UI 部分** (`Attribution` `DataFreshness` `GeolocationConsent` 等)、または `renderToString()` を `JSDOM` でパースして Server Component の出力を axe にかける (T20 解消)
   - 受入基準:
     - `/robots.txt` `/sitemap.xml` が 200
     - 全公開ルートの axe テスト緑
     - OG プレビュー表示、OG 画像 URL を直接叩いて 200 + `Content-Type: image/png` 返却 (S29)
     - 本番 CSP に `'unsafe-inline'` `'unsafe-eval'` が **script-src** に含まれない
     - nonce 生成が CSPRNG ベースであることを `lib/csp.ts` のユニットテストで確認 (`Math.random` 使用なし、128bit 以上)

10. **リリース準備**
    - Vercel 本番デプロイ、独自ドメイン (任意)
    - README: 非公式宣言 / 出典 / ライセンス / 観測性ツール導入の判断条件 / GitHub Actions 運用ルール / kill switch (運用継続性) を明記
    - フェーズ 2 ロードマップを Considerations に書き出し
    - 受入基準: Lighthouse Performance/Accessibility 各 90 以上 (手動測定、リリース時)、`npm audit --audit-level=high` が pass

## Testing strategy

### Vitest (ユニット)

- `lib/search.ts`: 正規化規則の網羅 (NFKC + ひら↔カナ + 半/全角 + 長音 + 濁点 + ローマ字)。`__fixtures__/dictionary-labels.json` を読み込みテーブル駆動。
- `lib/ics.ts`: 以下を assert
  - VTIMEZONE ブロックに `TZID:Asia/Tokyo` が出力される
  - `STATUS:CANCELLED` が中止イベントで出力される
  - SUMMARY/DESCRIPTION の `,` `;` `\` `\n` 各 1 ケースで正しくエスケープ
  - 改行が CRLF (`\r\n`)
  - UID と DTSTAMP は引数注入された `now()`/`uuid()` で決定論的
  - RRULE/EXDATE は MVP で未使用と明示 (テスト対象外)
- `lib/opendata/schemas/*.ts`: Zod スキーマに対し `__fixtures__/{valid,invalid}.json` で positive/negative
- `lib/opendata/normalize.ts`: 値域チェック (気温 -50〜50、WBGT 0〜50、緯度経度の江東区範囲)
- `lib/opendata/weather.ts` (純関数): URL 構築 / hostname allowlist 検証 / Zod 整形 / ヘッダ strip
- `app/api/weather/route.ts`: Web 標準 Request/Response で `Cache-Control` `Content-Type` ヘッダ assertion
- `lib/i18n/messages.ts`: `as const` object の型補完で「キー欠落 = ビルド失敗」を担保 (テスト不要)

### `vitest-axe` (アクセシビリティ)

- 全公開ルート (`app/**/page.tsx` を glob で列挙、`/weather` `/about` `/privacy` `/disclaimer` を含む) を対象に、Client Component に分離した UI 部分または `renderToString()` を `JSDOM` でパースして `expect(await axe(container)).toHaveNoViolations()` を実行 (T14, T20, T21 解消)

### Fixture 取得・更新

- `scripts/refresh-fixtures.ts` で実 API レスポンスを `__fixtures__/opendata/{aed,toilet,gomi,events,weather}.json` に保存
- `__fixtures__/README.md` に取得日時を記録
- 全モックは fixture を読み込む (RT1 mock-reality divergence 防止)
- cron (data-sync workflow) で最新と fixture の shape 差分を Discord 通知

### 受入基準と検証手段の対応表

| 受入基準 | 検証手段 | 頻度 |
|---|---|---|
| 検索の正規化網羅 | Vitest | コミット毎 (人手) |
| ICS RFC 5545 準拠 | Vitest + 初回 icalendar.org/validator | コミット毎 + 初回 |
| Edge proxy のハードニング (GET 限定 / hostname allowlist / ヘッダ strip / Zod) | Vitest (純関数 + 薄ラッパ) | コミット毎 |
| Edge proxy レート制限 60req/min | 実機 curl ループ | リリース時 |
| ICS の VTIMEZONE 解釈 | Apple Calendar / Google Calendar 実機 | リリース時 + ライブラリ更新時 |
| iOS Safari PWA + `webcal://` 購読 | iPhone 実機 | リリース時 |
| Lighthouse PWA pass | Vercel preview で Lighthouse 実行 | リリース時 |
| Lighthouse Performance/Accessibility 90+ | 同上 | リリース時 |
| LCP/CLS/JS バンドル予算 | `next build` 出力 + Lighthouse | リリース時 |
| WCAG 2.1 AA | `vitest-axe` + 手動 VoiceOver | コミット毎 + リリース時 |
| CSP / HSTS ヘッダ | `curl -I` + Vitest (next.config) | コミット毎 + 手動 |
| データ取得スキーマ検証 | Vitest + data-sync workflow 内 | コミット毎 + 日次 |

### 手動受入テスト

- 上記表で「リリース時」と分類された項目を Vercel preview で実施
- iOS Safari の Web Share API、PWA 追加、`webcal://` 購読の挙動を実機検証
- VoiceOver / TalkBack で主要画面を読み上げ確認

### 回帰防止

- ICS の決定論化は `vi.useFakeTimers + vi.setSystemTime('2026-01-01T00:00:00+09:00')` + 固定 UUID 注入で実施 (構造化 assertion の前提として flaky 防止。snapshot は使わない、T16/T22 解消)
- データ取得スクリプトの Zod 検証で、スキーマ変動を data-sync workflow が検知 → PR 起票で人手確認
- 上流 fetch 失敗時の挙動 (KV からの stale-if-error 配信) を Vitest で検証

### 範囲外

- E2E (Playwright) は MVP スコープ外
- PR 単位の test/lint workflow CI もフェーズ 2 (data-sync workflow は MVP に含む。「CI スコープ外」の意味を test/lint に絞る)
- Service Worker のキャッシュ戦略は Vitest 対象外 (機内モードの手動受入と Lighthouse PWA に逃がす)
- MapLibre による地図描画・ピンクリック・現在地取得は browser API 依存のため Vitest 対象外 (手動受入)
- Lighthouse の継続監視は CI 構築後 (フェーズ 2) に Lighthouse CI で自動化検討
- フェーズ 2 CI 導入順序: (1) Vitest 実行 → (2) Lighthouse CI → (3) JSON Schema 検証ジョブ単独化

## Considerations & constraints

### リスク

1. **江東区イベントデータの粒度・更新頻度が不明**: API はカタログ存在確認済 (`t131083d0000000017-...`)。実装初日 (Step 2) にレコード件数とサンプルを確認し、月平均件数が極端に少ない場合の補助ソース候補 ([江東区文化コミュニティ財団](https://www.kcf.or.jp/) ほか) の利用規約確認を **担当: 自分 / 期限: Step 6 着手前** で実施。
2. **オープンデータ API のスキーマ変動**: 自治体 API は予告なく形式が変わる。data-sync workflow の Zod 検証で早期検知し、失敗時は旧データ保持 + Discord 通知 + 人手確認の PR 起票。
3. **WBGT 公開条件**: 環境省は 1 日 3 回更新かつ機械可読データ提供あり (確認済)。動的プロキシ不要、`data/wbgt.json` に日次取得で十分。利用規約 ([/tos.php](https://www.wbgt.env.go.jp/tos.php)) は実装初日に再確認、東京エリアの観測地点コードを `config/opendata.ts` に確定。
4. **iOS Safari の PWA 制約**: プッシュ非対応、`webcal://` リダイレクト必須、Web Share API の `files` 制約。実機検証を Step 6 と Step 8 の受入に含める。
5. **個人運用の継続性**: 死活監視 (Vercel Status のみ) + `/disclaimer` での免責 + 一定期間更新が止まった場合の SW kill switch (フェーズ 2)。
6. **誤認防止義務 (CC-BY 4.0)**: 構造化された `<Attribution>` を全画面で参照、PWA name に「(非公式)」、OG ウォーターマーク、`<link rel="license">`、`/about`。色彩は中立色 (江東区シンボルカラーは避ける)。
7. **データセット ID 確定**: 主要 4 データセットは plan に固定値で記載済 (`t131083d3100000009-...`, `t131083d0000000027`, `t131083d0000000019`, `t131083d0000000017-...`)。「ゴミの分別方法一覧」のみ実装初日に再探索。**フォールバック方針 (R36)**: API 不在の品目辞書は他自治体辞書の流用または手動メンテに切替、PDF スクレイピングは行わない。
8. **タイル鯖の規約**: 国土地理院ベクトルタイルを一次選択。利用規約 ([地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html)) を実装初日に再確認。MapTiler 無料枠 / Protomaps セルフホストへの切替パスを `config/map.ts` で確保。
9. **Vercel KV のコスト**: Hobby 無料枠 (3,000 req/day, 256MB) でレート制限 + stale-if-error キャッシュは収まる想定。逼迫した場合は Upstash Redis に切替可能なよう `lib/proxy.ts` で抽象化。
10. **観測値バリデーション**: 上流レスポンスの改竄リスクに対し Zod の値域チェックを徹底。
11. **CSP report-uri / report-to の遅延** (S32): 観測性ツール導入時 (フェーズ 2) に `report-to` を追加。MVP では Discord 通知でカバー。
12. **CSP `connect-src` の将来拡張** (S28): WBGT を動的取得に切り替える等、新たな上流ホストを追加する場合は `config/proxy-allowlist.ts` の更新と `connect-src` 拡張を Step 7 と同じハードニング基準 (Zod / hostname 厳密一致 / レート制限) で評価する。

### Out of scope (MVP)

- ユーザーアカウント・認証
- プッシュ通知
- 多言語対応 (ja のみ。`lib/i18n/messages.ts` の `as const` で将来拡張に備える)
- 子育て支援・防災・人口統計など追加データセット (フェーズ 2 候補)
- **公式 PDF からのスクレイピング** (オープンデータ API があるため不要。R36 矛盾を解消)
- E2E (Playwright)
- PR 単位の test/lint workflow CI (フェーズ 2 で導入。data-sync workflow は MVP に含む)
- Sentry / Vercel Analytics 等の観測性ツール (フェーズ 2、導入条件を README に記載)
- SW kill switch (フェーズ 2、運用継続性対策)
- Lighthouse CI (フェーズ 2)

## User operation scenarios

### シナリオ 1: 朝にゴミ出しを確認

- 8:00、ホーム画面の PWA をタップ
- トップに「今日: 燃やすごみ」「明日: プラスチック」が表示される
- フッタの「カレンダー連携」から Google Calendar に登録 → 翌週から通知で受け取る

**Edge cases**:
- 初回起動: 地区未選択 → トップの上部にバナー「お住まいの地区を選択」、選択画面へ誘導
- 地区を間違えた: 設定画面で再選択可能
- 祝日・年末年始の特別日程: 公式の特別カレンダーがあれば追従、なければ通常スケジュール表示 + 注意書き
- 端末時計が JST 以外: `date-fns-tz` で Asia/Tokyo 固定

### シナリオ 2: 不用品を捨てる

- 「品目検索」に「電池」と入力
- 「乾電池: 不燃ごみ」「リチウムイオン: 区役所回収ボックス」が並ぶ
- 「リチウムイオン」詳細から「小型家電回収ボックス一覧」マップを表示

**Edge cases**:
- 「ぺっとぼとる」「PET」「ペットボトル」「ﾍﾟｯﾄﾎﾞﾄﾙ」すべてヒット
- 該当なし: 「該当なし。区役所への問い合わせ」リンク
- 1 文字検索 (「電」): 結果が多すぎるので件数制限 + 絞り込みヒント

### シナリオ 3: 外出先で AED を探す

- 公園で AED が必要な場面を想定
- 「マップ」→ 現在地中心 → 最近 AED へのルート (Google Maps へ外部リンク)

**Edge cases**:
- 位置情報拒否: 江東区中心にフォールバック + 住所検索フォールバック
- オフライン: キャッシュ済み AED 一覧でテキスト表示
- 24h 営業外の AED: 営業時間情報があれば「現在閉鎖中」を表示

### シナリオ 4: 区主催イベントをカレンダーに入れる

- 「イベント」一覧から夏祭りを選択
- 「Google Calendar に追加」ボタン
- 詳細ページから「すべてのイベントを購読」で ICS URL コピー

**Edge cases**:
- イベント中止・延期: ICS の `STATUS:CANCELLED` で反映
- タイムゾーン: VTIMEZONE で `Asia/Tokyo` を明示 (UTC 換算誤りを防ぐ)
- 数千件レンジになった場合: 既定で直近 90 日 + ページング

### シナリオ 5: 真夏に外出判断

- トップで「今日の WBGT: 31 (危険)」「最高気温 36 度」
- 「クーリングシェルター」リンクで指定避難施設マップ (フェーズ 2 拡張ポイント)

**Edge cases**:
- API 障害: 直近キャッシュ + 「データ取得失敗。環境省サイトへ」リンク
- 観測値が異常 (負の気温など): バリデーションでスキップ表示

## 確認ポイント (実装初日)

主要データセット ID は計画段階で確定済 (Plan の「データソース」表参照)。実装初日はサンプルレコード取得と詳細仕様の確認のみ。

- [ ] 「ゴミの分別方法一覧」のデータセット ID を再探索 (検索キーワード: 「分別」「資源化」「ごみ辞典」)
- [ ] 4 主要データセットの実 API レスポンスを取得し `__fixtures__/opendata/` に保存
- [ ] 環境省 WBGT 利用規約 ([/tos.php](https://www.wbgt.env.go.jp/tos.php)) を再確認、東京エリアの観測地点コードを `config/opendata.ts` に確定
- [ ] 国土地理院ベクトルタイル利用規約を再確認 (商用判定不要であることを `config/map.ts` にコメント記録)
- [ ] Vercel Hobby + Vercel KV 無料枠が想定アクセス量で収まることを確認
- [ ] Open-Meteo の利用規約 (CC-BY 4.0) と帰属表示文言を `config/attribution.ts` に固定

## Implementation Checklist (Step 2-1)

新規プロジェクトのため既存共有ユーティリティはゼロ (`scan-shared-utils.sh` 実行確認済)。実装は plan の「ディレクトリ構成」を新規作成しながら進める。各 Step の具体的な作業ファイル:

### Step 1 — プロジェクト初期化 + セキュリティ基盤
- `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`
- `.eslintrc.json`, `.prettierrc`, `renovate.json`
- `app/layout.tsx`, `app/page.tsx`, `app/about/page.tsx`, `app/privacy/page.tsx`, `app/disclaimer/page.tsx`, `app/not-found.tsx`, `app/error.tsx`, `app/offline/page.tsx`, `app/robots.ts`, `app/sitemap.ts`
- `middleware.ts` (nonce 発行)
- `lib/csp.ts` (`generateNonce()` CSPRNG ヘルパ、Vitest 対象)
- `components/Attribution.tsx` (Client), `components/DataFreshness.tsx` (Client), `components/GeolocationConsent.tsx` (Client)
- `config/site.ts`, `config/geo.ts`, `config/attribution.ts`
- 受入: `curl -I` で本番 CSP に `unsafe-eval` が含まれない、`/about` `/privacy` `/disclaimer` が 200

### Step 2 — データ取得スクリプト + Zod
- `lib/opendata/schemas/{aed,toilet,gomi,events,wbgt,weather}.ts`
- `lib/opendata/normalize.ts` (値域チェック含む)
- `scripts/fetch-opendata.ts`, `scripts/refresh-fixtures.ts`
- `__fixtures__/opendata/*.json`, `__fixtures__/README.md`
- `.github/workflows/data-sync.yml`
- `config/opendata.ts` (データセット ID), `config/proxy-allowlist.ts` (上流ホスト)
- 受入: スキーマ違反で旧 data 保持 + 非ゼロ exit + Discord called の Vitest

### Step 3 — ゴミ収集カレンダー
- `app/gomi/page.tsx`, `app/api/ics/gomi/[district]/route.ts`
- `data/districts.json`, `data/gomi-schedule.json`
- `config/districts.ts` (allowlist), `config/storage.ts`
- 受入: district 二段階検証の Vitest + 手動

### Step 4 — ゴミ品目検索
- `app/gomi/search/page.tsx`
- `lib/search.ts` (NFKC + ひら↔カナ + ローマ字 = wanakana)
- `data/gomi-dictionary.json`, `__fixtures__/dictionary-labels.json`
- 受入: ペットボトル正規化 5 入力テーブル駆動 Vitest

### Step 5 — AED/トイレマップ
- `app/map/page.tsx`
- `lib/distance.ts` (純関数、Vitest)
- `config/map.ts` (国土地理院ベクトルタイル URL + attribution)
- `data/aed.json`, `data/toilet.json`

### Step 6 — イベントカレンダー + ICS
- `app/events/page.tsx`, `app/api/ics/events/route.ts`
- `lib/ics.ts` (ical-generator + ical-timezones、`now()` `uuid()` 引数注入)
- `data/events.json` (build 時 import)
- 受入: VTIMEZONE / STATUS:CANCELLED / 全テキストエスケープ / CRLF / UID 決定論性 / LOCATION injection ネガティブ Vitest

### Step 7 — 天気 (Edge proxy)
- `app/api/weather/route.ts` (薄ラッパ)
- `lib/opendata/weather.ts` (純関数、Vitest)
- `lib/proxy.ts` (`KVStore` interface + Vercel KV アダプタ + In-memory fake + LRU フォールバック)
- 受入: 純関数 Vitest + KV fake で 60/61 req レート制限 Vitest + 実機 curl XFF 偽装

### Step 8 — PWA 化 + SW バージョニング
- `next.config.ts` に next-pwa 設定
- `public/manifest.json` (id/scope/start_url)
- `public/icons/*`
- 受入: Lighthouse PWA / `/offline` / SW CSP 違反なし / preview manifest 出し分け

### Step 9 — 共有・SEO・アクセシビリティ + CSP nonce 完了
- `app/api/og/route.tsx` (`next/og`)
- `app/sitemap.ts`, `app/robots.ts` 仕上げ
- `middleware.ts` の nonce 適用を本番 `script-src` で完全切替
- 受入: 全公開ルートの axe テスト緑、本番 CSP nonce 化、OG 画像 200

### Step 10 — リリース準備
- `README.md` (非公式宣言・出典・運用ルール・kill switch ロードマップ)
- Vercel 本番デプロイ
- 受入: Lighthouse Performance/Accessibility 90+、`npm audit --audit-level=high` pass

### 共通リソース (Step 1 で先行整備)
- `lib/datetime.ts` (date-fns-tz Asia/Tokyo)
- `lib/i18n/messages.ts` (`as const`)

### 並行禁止 (cross-step duplicate 防止)
- `KVStore` interface は Step 7 のみで定義、他 Step は import
- `<Attribution>` `<DataFreshness>` は Step 1 で定義、他 Step は使用のみ
- `config/*.ts` 定数は定義 Step 以外で再宣言禁止

## 運用ガイド (README に転記)

- 観測性ツール (Sentry / Vercel Analytics) 導入の判断条件: (a) PII フィルタ ON、(b) 同意 UI、(c) CSP `connect-src` 追加、(d) プライバシーポリシー更新、すべて満たした場合のみ
- LocalStorage に保存可能な key は `config/storage.ts` の allowlist に限定。PII / 健康 / 財務情報は禁止
- GitHub Actions secrets のローテーション目安: `DISCORD_WEBHOOK` は半年、`GITHUB_TOKEN` はデフォルト管理に依存
- リンク切れ検知: フェーズ 2 で `lychee` を導入、外部 URL の真正性を CI で確認
- kill switch (フェーズ 2): 一定期間更新が止まった場合に SW から `/maintenance` にリダイレクト
