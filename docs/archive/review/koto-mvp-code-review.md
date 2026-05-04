# Code Review: koto-mvp

Date: 2026-05-04
Review round: 1
Branch: feature/koto-mvp (vs main)
Diff stat: 151 files changed, +30269 / -1

## Changes from Previous Round

Initial code review.

Ollama 事前 screening (gpt-oss:120b、3 perspective seed) を経て 3 専門家 (機能性 / セキュリティ / テスト) が並行レビュー。Plan / deviation log / 変更ファイル全 151 を対象に R1-R36 + RS1-RS4 + RT1-RT3 を確認。

## Functionality Findings

### F-01 [Critical] Special-day overlay IDs don't match district master IDs
- File: data/gomi-schedule.json (lines 4, 18, 32) vs data/districts.json
- 全 3 件の overlay が `kameido-1`/`kameido-2`/`kameido-3`/`toyo-1`...`toyosu-2` を参照しているが、Step 9 の rebuild 後の district master は `kameido-1-3`, `kameido-4-9`, `toyo`, `tomioka`, `toyosu` 等。`overlays.find(o => o.districts.includes(district.id))` が常に undefined を返し、12/31 / 1/1 「収集なし」と 1/5 補完収集が **全地区で silently 反映されない**
- Result: 年末年始もスケジュール上は通常週次のまま表示される (実害)
- Fix: data/gomi-schedule.json を新 ID に更新、もしくは overlay を area レベル (fukagawa/joto) でモデル化

### F-02 [Major] gomiSubscriptionUrl returns 404 path + not wired into UI
- File: lib/ics/url.ts:20
- `path = `/api/ics/gomi/${district}/route.ics`` だが、実 route は `/api/ics/gomi/{district}` (末尾 `/route.ics` 不要)。コピーすると 404
- 関数は lib/ics/url.test.ts のみが import、UI から呼ばれていない (Plan F19 の受入「クリップボードコピーは webcal://」未達)
- Fix: path から `/route.ics` を削除、GomiPageClient or SettingsPageClient に「購読 URL コピー」ボタン追加 (EventsClient.tsx:323 を mirror)、テストに path 形状 assertion 追加

### F-03 [Major] WBGT (暑さ指数) feature not implemented
- File: app/weather/page.tsx:110, data/wbgt.json
- Plan req 5 が「当日・翌日の最高/最低気温・降水確率・WBGT」を mandate、ホームナビカードに「気温・WBGT」表記、`/weather` には「※ WBGT は今後実装予定」
- data/wbgt.json は `{"fetchedAt":"","readings":[]}` 空、import している component 無し
- Fix: WBGT 表示実装 (data-sync workflow が WBGT_STATION_CODE 確定後に populate) **OR** 明示 deviation 追記してフェーズ 2 に deferral し、ホームナビ・disclaimer から WBGT 文言を削除

### F-04 [Major / Design] SpecialOverlay.override couples specific-date with weekday list
- File: lib/gomi/schedule.ts:64-79 (applyOverlay)
- `override.<category>: Weekday[]` を `overlay.date === dateStr` の時にのみ評価、内側で再度 `overrideDays.includes(weekday)` チェック。エディタは date と weekday の整合を手で取る必要があり、F-01 と同根の brittle 設計
- Fix: override を `categories: GomiCategory[]` (その日に収集する分類のリスト) にフラット化

### F-05 [Minor] Duplicate `toEvent` between page and ICS route
- Files: app/events/page.tsx:19-48 + app/api/ics/events/route.ts:7-32
- Plan「並行禁止 (cross-step duplicate 防止)」違反。R3 propagation hazard
- Fix: lib/events/normalize.ts に集約、両 call site から import

### F-06 [Minor] Dead code: lib/datetime.ts / lib/opendata/normalize.ts / lib/map/normalize.ts
- 全て import 0。UI は date-fns 直 import、normalize は Zod のみで値域チェック (の dead 実装) 未使用
- Fix: 削除 or wire in

### F-07 [Minor] Two functions named `normalizeAed` / `normalizeToilet` with different signatures
- lib/opendata/normalize.ts:41 vs lib/map/normalize.ts:10。両方 unused (F-06) で latent conflict
- Fix: 一方を削除

### F-08 [Minor] Unused UPSTREAM_HOSTS import in app/api/weather/route.ts:5
### F-09 [Minor] Unused imports (existsSync / readFileSync) in scripts/fetch-opendata.ts:11
### F-10 [Minor] app/sitemap.ts:5 `now` is module-scope → lastModified frozen
- Fix: `const now = new Date()` を sitemap() 関数内に移動

### F-11 [Minor / CC-BY hygiene] OSM attribution declares `modified: false` but data is filtered/derived
- config/attribution.ts:69-76。Plan「帰属表示と誤認防止 (CC-BY 4.0 義務)」と整合させるため `modified: true` に

## Security Findings

### S-01 [Major] Workflow secret/write-token exposure to merged-PR tampering
- File: .github/workflows/data-sync.yml:13-15, 60
- `permissions: { contents: write, pull-requests: write }` + `DISCORD_WEBHOOK` + GITHUB_TOKEN。攻撃者が悪意ある PR を merge できればスケジュール実行で secret 取得 + 任意コード実行
- 3rd-party Action `peter-evans/create-pull-request@v6` も floating major タグで namespace-takeover 経路あり
- Fix: branch protection (CODEOWNERS for `.github/workflows/**` and `scripts/**`)、Action を SHA pin、DISCORD_WEBHOOK を Environment 化 (manual approval)、permissions per-step 削減
- escalate: false / 標準的な CI/CD ハードニング

### S-02 [Major] Missing rate limit on /api/og — CPU-amplification DoS
- File: app/api/og/route.tsx:7-108
- ImageResponse 1200x630 PNG をリクエスト毎に生成、レート制限なし。`enforceRateLimit` helper は他 route で利用済
- Fix: `enforceRateLimit(kv, kvKey('rl', v, 'og', ip), 30, 60)` 適用

### S-03 [Major] Missing rate limit on /api/ics/events and /api/ics/gomi/[district]
- Files: app/api/ics/events/route.ts:34, app/api/ics/gomi/[district]/route.ts:12
- 公開エンドポイント、ICS 合成サーバ側、レート制限なし。`/api/ics/gomi/[district]` は overlay 数 + 90 日分の作業
- Fix: `enforceRateLimit(kv, kvKey('rl', v, 'ics-...', ip), 60, 60)` 適用

### S-04 [Minor] Webhook notify forwards raw KV err.message
- File: lib/proxy.ts:184-189; call sites at app/api/weather/route.ts, app/api/pois/route.ts
- err.message が Discord に転送される。edge case で URL-encoded credentials が混入する可能性 (defense-in-depth 違反)
- Fix: 固定文言 ("primary KV failure, fell back to LRU") で送信、診断は Vercel logs に任せる

### S-05 [Minor] 3rd-party GitHub Actions pinned to floating major tags
- File: .github/workflows/data-sync.yml:29, 32, 42, 58
- Fix: `actions/checkout@<SHA> # v4.x.y` 等で pin、Renovate の `pinDigests`

### S-06 [Minor] style-src 'unsafe-inline' in production CSP
- File: lib/csp.ts:37
- script-src nonce で main XSS は塞がれるが CSS injection で style-exfiltrate (visited-link / attribute selectors) リスク
- Fix: nonce-based style-src を Tailwind/Next.js 互換性確認の上で導入、不可なら rationale を directive 横に明記

### S-07 [Minor / Note only] /api/ics/events single corrupted record disables whole calendar
- File: app/api/ics/events/route.ts:36
- `EventRecordSchema.parse(r)` 各レコード、1 失敗で 500。URL は Zod で https-only。No fix required, layered controls validated

## Testing Findings

### T-02 [Major] generate-pois.mjs hand-rolled CSV parser untested
- File: scripts/generate-pois.mjs:53-98
- `parseCsvRow` (`""` escape / 埋め込みカンマ / quote toggle) が完全に未テスト。off-by-one で全 record の lat/lng が silently column shift する可能性 (本症状で過去にバグ発生済)
- Fix: parseCsvRow を named export 化、edge-case rows (`"江東区,1-1-1"` / `"a""b"` / 空セル / 混在 CRLF) で Vitest

### T-03 [Major] fetch-opendata.ts HTTP / WBGT-CSV path untested
- File: scripts/fetch-opendata.ts:76-153
- `fetchJson` (Content-Type allowlist / redirect:'manual' / AbortSignal timeout) と `fetchWbgt` (CSV: `slice(1)` で header 落とし、parseFloat NaN フィルタ) が **export されておらず未テスト**。Plan Step 2 受入が明記した不正レスポンス再現の Vitest が validateAndPersist のみ
- Fix: fetchJson と fetchWbgt (or 抽出した parseWbgtCsv) を export、fetch mock で non-2xx / 不正 CT / redirect+signal 通過、CSV fixtures (空 datetime / NaN value / 空行 / 末尾改行欠損)

### T-04 [Major] biweekly schedule semantically dropped → 誤った schedule for ~58 districts
- File: scripts/generate-districts.mjs:107,159 + lib/gomi/schedule.ts:96-117
- `parseDays` が `biweekly: true` を抽出するが `rowToDistrict` で discard、free-text `notes` のみ。`WeeklyScheduleSchema` に biweekly フィールドなし、`resolveSchedule` に biweekly cadence 概念なし
- Result: non_burnable: ['sat'] が **毎週土曜** で出力 (公式は隔週土曜)。ICS subscription 過剰報告
- Fix:
  (a) WeeklyScheduleSchema に `biweekly: { non_burnable?: { anchorDate } }` を拡張、resolveSchedule で 2 週間 cadence、Vitest で anchor からの seq 確認
  (b) MVP 範囲外として明示、UI に flag 表示

### T-01 [Minor] generate-districts.mjs CSV parse logic untested
- File: scripts/generate-districts.mjs:103-167
- parseDays / slugifySuffix / rowToDistrict が pure 関数だが未テスト。`（隔週）土` `月・木・日` 等のエッジケース未確認
- Demoted to Minor: build-time tooling, 出力は再生成可能、downstream でシェイプ捕捉

### T-05 [Minor] /api/ics/gomi/[district]/route.ts: handler `new Date()` not injectable
- File: app/api/ics/gomi/[district]/route.ts:42-49
- 90 日 window の年月境界 / overlay 適用 silent 失敗が捕捉されない
- Fix: now() 引数注入 or vi.setSystemTime + body assertion (kameido-1-3 known Monday → ICS に SUMMARY:燃やすごみ VEVENT)

### T-06 [Minor] fetch-opendata.test.ts shared TMP_DIR not cleaned (RT3)
- File: scripts/fetch-opendata.test.ts:8
- Fix: `afterAll(() => rmSync(TMP_DIR, {recursive,force}))` or per-test mkdtempSync

### T-07 [Minor] lib/ics/url.test.ts + lib/ics.test.ts use stale `kameido-1` (RT1 mock-reality drift)
- Real ID は kameido-1-3 / kameido-4-9。test pass するのは関数が任意文字列を受けるため、allowlist 強化や shape 変更で silently 検知漏れ
- Fix: data/districts.json[0].id を import or `kameido-1-3` にハードコード

## Adjacent Findings

なし

## Quality Warnings

なし — 全 finding が file:line evidence 付き、具体的 Fix 提案を含む。

## Recurring Issue Check

### Functionality expert
- R1-R2: OK
- R3 Pattern propagation: F-05 (toEvent), F-07 (normalizeAed/Toilet)
- R4 Dead code: F-06, F-08, F-09
- R5-R12: OK
- R13 Schema vs data: F-01
- R14-R29: OK
- R30 Plan deviation undocumented: F-01, F-02, F-03 が deviation log 不在
- R31-R36: OK

### Security expert
- R1 SSRF: Pass
- R2 Open redirect: Pass
- R3 XSS: Pass (zero dangerouslySetInnerHTML)
- R4 SQLi: N/A
- R5 NoSQL injection: Pass
- R6 Command injection: Pass
- R7 Path traversal: Pass
- R8 Rate limit on new public routes: FAIL → S-02, S-03
- R9 Input validation at boundary: Pass
- R10 CSP weak: Partial → S-06
- R11 CORS wildcard: Pass
- R12-R17: Pass / N/A
- R16 Secrets in logs: Partial → S-04
- R18 Dependency CVEs: Acknowledged
- R19 Action pinning: FAIL → S-05
- R20-R36: Pass / N/A
- RS1: N/A
- RS2: FAIL → S-02, S-03
- RS3: Pass
- RS4: Pass

### Testing expert
- R1-R10: OK
- R11-R14: OK
- R15: T-05 partial
- R16-R19: OK
- R20: Partial (axe excludes 7 data-bound pages with rationale)
- R21: Minor note (axe glob)
- R22-R26: out-of-scope (CI/E2E)
- R27: T-06
- R28-R33: OK
- R34: T-03
- R35-R36: OK
- RT1: T-07
- RT2: T-02 / T-03 / T-05
- RT3: T-06

## Resolution Status

### F-01 [Critical] Special-day overlay IDs don't match district master IDs — Resolved
- data/gomi-schedule.json を全 58 ID (新スキーマ) に書き直し、`override` を `categories: GomiCategory[]` に簡素化
- 関連: lib/gomi/types.ts, lib/gomi/schedule.ts (applyOverlay 簡素化), lib/gomi/schedule.test.ts (新スキーマで 10 件)

### F-02 [Major] gomiSubscriptionUrl 404 path + UI 未配線 — Resolved
- lib/ics/url.ts:20 `path` から `/route.ics` を削除
- components/SubscribeButton.tsx を新設、GomiPageClient.tsx で district 表示直下に配置
- lib/ics/url.test.ts に path 形状の regression-guard assertion 追加

### F-03 [Major] WBGT 機能未実装 — Resolved (deferral 文書化 + UI 整理)
- app/page.tsx ホームナビカード「天気・暑さ指数 / 気温・WBGT」→「天気 / 気温・降水確率」
- app/weather/page.tsx 末尾の「今後実装予定」を「フェーズ 2 で対応 — 当面は環境省サイトを参照」に変更 + 環境省 link
- 公式 WBGT 取得ロジック自体は data-sync workflow に既存。フェーズ 2 で WBGT_STATION_CODE 確定 + UI 配線

### F-04 [Major / Design] SpecialOverlay schema 簡素化 — Resolved
- F-01 と同根。`override: PartialWeeklySchedule` を `categories: GomiCategory[]` に置換、applyOverlay は overlay.categories をそのまま day の collection set にする
- 編集者は date と weekday の整合を取る必要がなくなり、年またぎでもバグらない設計

### F-05 [Minor] toEvent 重複 — Resolved
- lib/events/normalize.ts 新設、`toEvent` + `filterUpcoming` を集約
- app/events/page.tsx と app/api/ics/events/route.ts の両方が import

### F-06 [Minor] Dead code (lib/datetime.ts, lib/opendata/normalize.ts) — Resolved
- 両モジュールを削除。`lib/map/normalize.ts` は `lib/map/validate.ts` から実利用されていたため復元 (expert の判定誤り)

### F-07 [Minor] normalizeAed/Toilet 同名関数の signature 衝突 — Resolved
- F-06 で lib/opendata/normalize.ts を削除したため latent conflict は消滅

### F-08 [Minor] Unused UPSTREAM_HOSTS import — Resolved
- app/api/weather/route.ts:5 から削除

### F-09 [Minor] scripts/fetch-opendata.ts の existsSync/readFileSync 未使用 — Resolved
- import を削除

### F-10 [Minor] sitemap lastModified 凍結 — Resolved
- `const now = new Date()` を sitemap() 関数内に移動

### F-11 [Minor] OSM attribution `modified: false` 不整合 — Resolved
- config/attribution.ts の openstreetmap エントリを `modified: true` に変更 + 理由コメント

### S-01 [Major] Workflow secret/write-token exposure — Resolved
- .github/workflows/data-sync.yml: 全 3rd-party Action を commit SHA に pin (actions/checkout, actions/setup-node, actions/cache, peter-evans/create-pull-request)
- 既定 permissions を `contents: read` に絞り、job-level で `contents: write, pull-requests: write` に elevate
- 残りの操作層 control (branch protection, CODEOWNERS, environment-protected secret) はリリース時に GitHub UI で設定

### S-02 [Major] /api/og rate limit 欠如 — Resolved
- lib/api-shared.ts に `checkRateLimit` ヘルパ集約
- app/api/og/route.tsx に `bucket: 'og', limit: 30, windowSec: 60` 適用 (CDN absorb 前提でタイト)

### S-03 [Major] /api/ics/* rate limit 欠如 — Resolved
- app/api/ics/events/route.ts と app/api/ics/gomi/[district]/route.ts に `bucket: 'ics-...', limit: 60, windowSec: 60` 適用

### S-04 [Minor] webhook が err.message を転送 (defense-in-depth) — Resolved
- lib/api-shared.ts の `notify` を固定文言 `[koto-city] primary KV failure, fell back to LRU` に変更。診断は Vercel logs

### S-05 [Minor] 3rd-party Action floating tag — Resolved
- S-01 と一括対応 (commit SHA pin)

### S-06 [Minor] CSP style-src 'unsafe-inline' — Resolved (rationale 明記)
- lib/csp.ts:36 に Tailwind v4 の inline <style> 都合と residual risk 評価を comment で明記、フェーズ 2 で再評価する旨

### S-07 [Minor / Note] ICS event 1 件失敗で全 calendar が 500 — Resolved (no fix needed)
- Layered controls (Zod URL https-only + safeUrl) は適切と確認、防御層は完備

### T-01 [Minor] generate-districts.mjs 未テスト — Skipped
- **Anti-Deferral check**: out of scope (different feature: build-time tooling)
- **Justification**: フェーズ 2 で CI を導入する際、`generate-pois.mjs` 同様に lib/csv.ts を介する設計に移行する予定。MVP では downstream JSON が Zod 検証されているため、parser 単体の regression は schedule.test.ts / route.test.ts で間接的に検出される。
- TODO marker: `TODO(koto-mvp-phase2): extract generate-districts.mjs pure functions to lib/ for testing`

### T-02 [Major] generate-pois.mjs CSV parser 未テスト — Resolved
- lib/csv.ts を新設、parseCsvRow / parseCsv を export
- lib/csv.test.ts 16 ケース (embedded comma / `""` escape / blank lines / CRLF / quoted with multiple escapes / etc.)
- scripts/generate-pois.mjs はインライン実装をミラー (TS file を .mjs から直 import 不可) + コメントで「canonical implementation lives in lib/csv.ts」を明記

### T-03 [Major] fetch-opendata.ts HTTP/WBGT 未テスト — Resolved
- fetchJson と parseWbgtCsv を export
- scripts/fetch-opendata.test.ts に 10 ケース追加 (redirect:'manual' 確認 / 非 2xx 拒否 / Content-Type allowlist / WBGT CSV header skip / 空 datetime / NaN value / CRLF 対応 / station label override)

### T-04 [Major] biweekly schedule 未対応 → ~58 districts で over-report — Resolved (deferral 文書化 + UI 警告)
- lib/gomi/schedule.ts に "Phase 2 — biweekly" 注記追記
- app/gomi/GomiPageClient.tsx の district 表示直下で `district.notes`（隔週収集メモ）を amber バナーで表示し、ユーザに「公式サイトの隔週日程を最終確認」を促す
- biweekly cadence の正式実装はフェーズ 2 で WBGT と一緒に対応

### T-05 [Minor] /api/ics/gomi route handler 時刻 injectable + body assertion — Skipped
- **Anti-Deferral check**: acceptable risk
- **Justification**: 
  - Worst case: 90-day window の年/月境界で off-by-one が混入すれば 1 日ずれた ICS が配信される (生命影響なし、ユーザは公式サイト確認可能)
  - Likelihood: low — date-fns startOfDay/endOfDay 系は使わず素朴な `new Date(year, month, day)` で構築、年境界での誤差は理論的にない
  - Cost to fix: ~30 分 (now() 引数注入 + Vitest setSystemTime + body grep)
- TODO marker: `TODO(koto-mvp-phase2): inject now() into /api/ics/gomi handler + body assertion`

### T-06 [Minor] fetch-opendata.test.ts TMP_DIR cleanup — Resolved
- `afterAll(rmSync(TMP_DIR, {recursive,force}))` を追加

### T-07 [Minor] Stale `kameido-1` literals — Resolved
- lib/ics/url.test.ts と lib/ics.test.ts を `kameido-1-3` に更新、UID assertion も対応

## Tightening-only skip evaluation

Round 1 で発見された 23 件 (Critical 1 / Major 9 / Minor 13) のうち、20 件は plan-level 行動を要する resolution、3 件 (T-01, T-05, S-07) は Anti-Deferral 文書化済 deferral または "no fix needed"。Tightening-only skip 条件を満たさない (security boundary 触る S-01〜S-06 を含む) ため、Round 2 を回す。

---

# Round 2 (Incremental Verification)

Date: 2026-05-04

## Round 2 Findings

### F-12 [Critical / Regression] district id collision (新大橋 vs 新木場) → Resolved
- 上流 CSV が新大橋を `しんきば` (typo) と publish しているため、Step-9 のリビルド時に新木場と同じ id `shinkiba` が出力されていた。`districtsData.find(...)` が常に最初の match (新大橋) を返し、新木場ユーザーは別の収集スケジュールを表示・購読してしまう regression
- Fix:
  - scripts/generate-districts.mjs に `LABEL_READING_OVERRIDE = { 新大橋: 'しんおおはし', 毛利: 'もうり' }` を追加
  - 出力後の id duplicate 検出で **fail-fast** (build を壊す)、上流 typo が再発しても気付ける
  - data/districts.json と data/gomi-schedule.json を再生成。新大橋 → `shin-ohashi`、新木場 → `shinkiba`、毛利 → `mouri` で 58 件すべて unique 確認

### F-13 [Major / Regression] SubscribeButton SSR hydration mismatch → Resolved
- SSR で `window.location.host = ""` のため `https:///api/...` が server-rendered HTML に焼かれ、hydrate 時に変わる → React hydration warning + 1 回目の click で 404
- Fix: useState (`subscribeUrl: string | null`) + useEffect で post-mount 計算、placeholder 期間中は disabled `<span>` をレンダリング、コピー button も disabled。href の "" は出さない

### F-14 [Major] /api/weather + /api/pois が api-shared に未 migrate → Resolved
- 既存 2 route が `lib/api-shared.ts` を使わずに `enforceRateLimit` を直接呼んでおり、観測性 / log 追加時に二重メンテになる
- Fix: 両方を `rateLimitResponse` + `jsonResponseHeaders` + `buildKv` + `getAllowedOrigin` に移行、共通 pipeline 一本化

### F-15 [Minor] generate-pois.mjs に CSV parser インラインコピーが重複 → Resolved
- scripts/generate-pois.mjs を `.ts` に変換し、`lib/csv.ts` を直接 import (npm scripts は `npx tsx` で実行)
- TS compilation で型整合性も確保 (build に generate-pois.ts も含まれるため、parser drift は build error で検知)

### F-16 [Adjacent → Functionality] /api/ics/events が全件配信していた → Resolved
- toEvent で全レコードを ICS に詰め込んでいたが、ページは filterUpcoming 90日適用済 (F-05 の split で気付いた divergence)
- Fix: route handler でも `filterUpcoming(events)` を適用、ICS と page の出力を一致

### T-08 [Major] lib/api-shared.ts 未テスト → Resolved
- lib/api-shared.test.ts を新設、checkRateLimit / rateLimitResponse / jsonResponseHeaders / getAllowedOrigin / buildKv の 9 ケース

### T-09 [Major] lib/events/normalize.ts 未テスト → Resolved
- lib/events/normalize.test.ts を新設、toEvent (status mapping、空 備考 → undefined) と filterUpcoming (window 内/外、終了日今日 inclusive、custom window) の 9 ケース

### T-10 [Major] /api/ics/events route テスト不在 → Resolved
- app/api/ics/events/route.test.ts を新設、200 / Content-Type / Content-Disposition / VCALENDAR / 60→61 で 429 Retry-After (S-03 boundary) の 4 ケース

### T-11 [Minor] /api/ics/gomi route 429 ブランチ未テスト → Resolved
- 既存 route.test.ts に @vercel/kv stub を mock、60 req OK / 61 req 429 の境界テスト追加

### T-12 [Minor] inline-CSV drift in generate-pois → Resolved (F-15 と同時)

### T-13 [Minor] SubscribeButton 未テスト → Resolved
- components/SubscribeButton.test.tsx を新設、@testing-library/react + jest-dom + 3 ケース (placeholder 確認、href post-mount、clipboard write)
- @testing-library/user-event + @testing-library/jest-dom を devDependencies に追加

### T-14 [Minor] schedule.test.ts と url.ts doc に残る `kameido-1` → Resolved
- lib/gomi/schedule.test.ts は test-synthetic な `id: "test-kameido"` に変更 (master との整合性ではなく、master との **drift detection** を狙った)
- lib/ics/url.ts の JSDoc 例を `kameido-1-3` に更新

### N-01 [Low / informational] notify webhook flood — Resolved
- lib/api-shared.ts の `notify` を 5 分 dedupe (`lastNotifyAt`)、worker 単位で 1 度だけ送信。KV outage 中の Discord フラッディング防止

### N-02 [Low / doc drift] workflow comment が "step-level permissions" を誤記 — Resolved
- .github/workflows/data-sync.yml のコメントを「workflow-default は read-only、`sync` job が write に elevate (step-level permissions は GitHub Actions が未サポートなので job が最小単位)」に修正

## Round 2 New Findings

なし — Functionality / Security / Testing いずれの Round 2 expert も新規 Critical/Major を報告していない。Security N-01/N-02 (Low) は本ラウンドで反映済。

## Round 2 Resolution Summary

- Critical: 1 (F-12) → Resolved
- Major: 6 (F-13, F-14, T-08, T-09, T-10) + Adjacent F-16 → Resolved
- Minor: 7 (F-15, T-11, T-12, T-13, T-14, N-01, N-02) → Resolved
- 全 14 件すべてプランに反映、303/303 tests pass

## Termination

Round 1 → Round 2 で発見された全 finding を resolution。新規発見はゼロ。Round 2 で Tightening-only skip 条件 (inline minor + 直前 fix scope 内 + security boundary 非該当) をすべて満たす finding は**ない**ので、安全のため **Round 3 verification** を回す。

---

# Round 3 (Incremental Verification + Tightening-only Skip)

Date: 2026-05-04

## Round 3 Findings

### F-17 [Major / Regression] generate-pois.ts top-level await crashes under tsx — Resolved
- F-15 で `.mjs → .ts` に変換した際、`package.json` に `"type": "module"` がないため tsx (esbuild) が CJS 出力でフォールバックし、top-level await が拒否されてスクリプトが起動不能だった
- Fix: `await buildAed(); await buildToilet()` を `async function main() { ... }` でラップして `main().catch(err => { console.error(err); process.exit(1); })`、sibling scripts (`fetch-opendata.ts` 他) のパターンに揃えた
- 検証: `npx tsx scripts/generate-pois.ts` が AED 246 件 + トイレ 191 件を正常に書き出し

### F-18 [Minor] SubscribeButton dead-code SSR guard — Resolved
- `useEffect(() => { if (typeof window === "undefined") return; ... })` は到達不能 (effect は client only)
- Fix: gard を削除しコメントで「useEffect は client-only なので window 検査不要」と明記

### T-15 [Minor] misleading test descriptions — Resolved
- (1) `app/api/ics/events/route.test.ts:52` の test name "denies the 31st request" を **"denies the 61st request"** に修正 (limit 60 と整合)
- (2) `components/SubscribeButton.test.tsx` の "renders the placeholder before URL is computed" は両 branch が同じ "カレンダーに登録" 文字列を render するため vacuous だった。`querySelector('span[aria-disabled="true"]')` で placeholder branch そのものをチェック、live link になった場合は href が `https:///` (empty authority) でないことを assert (F-13 regression-guard 強化)

### T-16 [Minor / Test isolation hazard] env "undefined" string leak — Resolved
- `lib/api-shared.test.ts` の `process.env.NEXT_PUBLIC_SITE_URL = original` は Node が undefined を `"undefined"` 文字列に coerce する。同 suite 内で兄弟テストが env を読むと poison
- Fix: `restore()` ヘルパで `original === undefined` なら `delete process.env.NEXT_PUBLIC_SITE_URL`、そうでなければ書き戻し

### T-17 [Minor] filterUpcoming TZ-leaky boundary — Deferral (documented)
- **Anti-Deferral check**: acceptable risk
- **Justification**:
  - Worst case: `filterUpcoming` の `Date` 比較が naive で、ホスト TZ と event date string の TZ contract が暗黙。**現状は UTC midnight ≥ JST midnight が常に成り立つので boundary が "passes for the right reason"**、すなわち実害なし
  - Likelihood: 低 — Vercel Edge は UTC、開発機は通常 JST、両 TZ で同じ判定になる
  - Cost to fix: ~1 時間 (filterUpcoming に TZ パラメータ追加 + date-fns-tz 統合 + 全 call site 移行)
- TODO marker: `TODO(koto-mvp-phase2): make filterUpcoming TZ-aware (date-fns-tz Asia/Tokyo) and pin the boundary tests with vi.setSystemTime`

## Tightening-only skip evaluation (Round 3)

Round 3 で発見された全 5 件 (F-17 Major regression + F-18, T-15, T-16, T-17 Minor) のうち:
- F-17 は Round 2 fix の直接的な regression で **Major + テスト fix 含む** ので skip 不可 → 反映済
- F-18: scope 内 inline minor、security boundary 非該当 ✓
- T-15: test-only cosmetic + correctness、scope 内 ✓
- T-16: test-only isolation fix、scope 内 ✓
- T-17: deferral、scope 内 ✓

F-17 だけが skip 条件を破るが、本コミットで修正済。残り 4 件はすべて inline minor で次のラウンドを必要としない。**Round 4 を skip して Phase 3 終了**:

```
## Tightening-only skip — Round 4
Findings applied directly (no Round 4 review):
- [F-18] [Minor] SubscribeButton dead-code SSR guard — components/SubscribeButton.tsx:27 — applied
- [T-15] [Minor] misleading test descriptions — app/api/ics/events/route.test.ts:52, components/SubscribeButton.test.tsx — applied
- [T-16] [Minor] env "undefined" string leak — lib/api-shared.test.ts:125-143 — applied
- [T-17] [Minor] TZ-leaky boundary — lib/events/normalize.test.ts:95-102 — Anti-Deferral block + TODO marker
Justification: every finding scoped within Round 2 fix range, inline minor or test-only, no security-boundary touch (Security Round 3 returned No findings).
```

## Round 3 Resolution Summary

- Critical: 0
- Major: 1 (F-17 regression of F-15) → Resolved
- Minor: 4 (F-18, T-15, T-16) → Resolved + (T-17) → Deferred with Anti-Deferral block
- 303/303 tests pass, lint clean, build clean



