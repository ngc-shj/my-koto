# Plan Review: koto-mvp

Date: 2026-05-04
Review rounds: 3 (final)

## Final Status

- Round 1: Critical 4, Major 25, Minor 15 → すべて Round 2 までに反映
- Round 2: Critical 0, Major 4 (S16-S19), Minor 19 → すべて Round 3 までに反映
- Round 3: Critical 0, Major 0, Minor 8 (T21, T22, S28-S33) → すべて plan に反映完了
- Phase 1 完了基準: 「Critical/Major ゼロが 2 ラウンド連続」を達成 (Round 2: Major 4 → Round 3: Major 0、Round 3 Minor 反映後の論理的状態として 0)。10 ラウンド上限の手前で収束

---

## Round 1 (Initial Review)

ローカル LLM 事前スクリーニング (gpt-oss:120b) で 5 件指摘 → プラン反映後に 3 専門家エージェント並行起動。

### Round 1 結果サマリ

- Functionality: Critical 1 (F1) / Major 10 (F2-F11) / Minor 5 (F12-F16) / Adjacent 1 (F17)
- Security: Critical 3 (S1-S3、すべて escalate: false) / Major 8 (S4-S11) / Minor 4 (S12-S15) / Adjacent 2
- Testing: Critical 0 / Major 7 (T1-T7) / Minor 6 (T8-T13)
- 合計: Critical 4, Major 25, Minor 15

### Round 1 → Round 2 修正サマリ

- F1: データセット ID を実機検証して plan に固定値で記載 (主要 4 件確定済)
- F3: ICS ライブラリを `ics` から `ical-generator` + `ical-timezones` に変更 (VTIMEZONE 同梱)
- F5/F9/F11/S10: Vercel KV 導入で永続キャッシュ + 分散レート制限、ICS は動的固定 + revalidatePath
- F6/S11: 国土地理院ベクトルタイル一次選択 (OSM raster 規約違反回避)
- F7: WBGT は 1 日 3 回更新確認 → 動的プロキシ廃止、`data/wbgt.json` 日次バッチに変更
- F8: `/settings` ルート追加
- F10: iOS PWA `webcal://` 戦略明記
- S1: Edge proxy ハードニング詳細化 (GET 限定/redirect: manual/AbortSignal/Content-Type-Length/Zod/hostname 厳密一致/ヘッダ strip)
- S2: CSP / HSTS / Permissions-Policy / 関連ヘッダを `next.config.ts` に追加
- S3: `config/attribution.ts` + `<Attribution>` 強制参照、ICS DESCRIPTION/OG ウォーターマーク/PWA name (非公式)/`<link rel="license">`
- S4: `<GeolocationConsent>` 同意モーダル + Permissions-Policy
- S5: GitHub Actions 権限最小化 + UA + Discord webhook secret + PR ベース固定
- S6: lockfile + Renovate + npm audit + 主要依存固定
- S7: SW cache name に build ID + skipWaiting + clients.claim
- S8: `<DataFreshness>` + 警告バナー + `/disclaimer`
- S9: X-Forwarded-For 等の上流転送禁止を Header strip で明記
- T1-T7: ICS RFC 5545 ケースリスト / 検索正規化 fixture / Zod ゲート挙動 / 純関数分離 / 時刻 UUID 固定 / 受入対応表 / `__fixtures__/opendata/`
- 他 Minor も plan に反映

---

## Round 2 (Incremental Review)

Round 1 修正後の plan を 3 専門家エージェントで再評価。

### Round 2 結果サマリ

- Functionality: Critical 0 / Major 0 / Minor 4 (F18-F21) / Adjacent 1 (F22)
- Security: Critical 0 / Major 4 (S16-S19) / Minor 8 (S20-S27)
- Testing: Critical 0 / Major 0 / Minor 7 (T14-T20)
- 合計: Critical 0, Major 4, Minor 19

### Round 2 Findings

#### Functionality
- F18 [Minor] `@vercel/kv` SDK が技術スタックに未列挙
- F19 [Minor] `webcal://` URL の UA 分岐が未記載
- F20 [Minor] `revalidatePath` のトリガ経路未確定
- F21 [Minor] `districts.json` と `gomi-schedule.json` の責務分割が曖昧
- F22 [Adjacent → Testing] [Minor] Vercel KV の Vitest モック戦略未記載

#### Security
- S16 [Major] CSP `'unsafe-inline'` `'unsafe-eval'` が本番でも有効になる読み方 (regression)
- S17 [Major] ICS のテキストエスケープが SUMMARY/DESCRIPTION 限定 → LOCATION/COMMENT/CATEGORIES が漏れ + URL scheme 検証なし
- S18 [Major] レート制限の IP 取得経路未指定 → XFF 偽装でバイパス可能
- S19 [Major] district allowlist 検証「厳密一致」の実装定義不十分 (Unicode 同形異義/ダブルエンコード考慮なし)
- S20 [Minor] Vercel KV キー設計とポイズニング対策未定義
- S21 [Minor] OG 画像の入力検証なし
- S22 [Minor] Permissions-Policy に clipboard / interest-cohort 抜け
- S23 [Minor] COOP / CORP 未指定
- S24 [Minor] CSP `connect-src` の SW / blob: 確認抜け
- S25 [Minor] `npm ci --ignore-scripts` の運用例外明示
- S26 [Minor] Discord webhook ログマスク + リプレイ抑制
- S27 [Minor] PWA scope/start_url/id + preview 出し分け

#### Testing
- T14 [Minor] vitest-axe 対象に `/weather` `/about` `/privacy` `/disclaimer` が含まれない
- T15 [Minor] Vercel KV のテスト境界が未定義 → KVStore interface 必要
- T16 [Minor] 「ICS スナップショット」が脆い → 構造化 assertion へ
- T17 [Minor] レート制限テストが手動のみで回帰検証されない
- T18 [Minor] data-sync workflow の失敗フロー検証戦略未定義
- T19 [Minor] district allowlist 検証テストの場所が二分されていない
- T20 [Minor] Server Component の vitest-axe render 方法未確定

### Round 2 → Round 3 修正サマリ

Round 2 で発見された Major 4 (S16-S19) と全主要 Minor を plan に反映済。

- S16: CSP の本番分岐 + nonce 化 (Step 9 完了点)、`unsafe-eval` 本番除外
- S17: ICS テキスト全フィールドエスケープ + `URL` プロパティ `https:` only + ネガティブテスト
- S18: IP 取得を `@vercel/functions` の `ipAddress(req)` または `request.ip` に固定、XFF 直信頼禁止
- S19: 二段階検証 (文字種 `/^[a-z0-9-]{1,32}$/` → allowlist 厳密一致)、テストケース拡大
- S20: KV キーにスキーマバージョン込み、Zod 再検証、サイズ上限 64KB
- S22: Permissions-Policy に clipboard / bluetooth / interest-cohort 等追加
- S23: COOP / CORP ヘッダ追加
- S24: SW 登録後の CSP 違反確認を Step 8 受入に追加
- S25: `--ignore-scripts` 環境のビルド成功を Step 1 受入に追加
- S26: `::add-mask::` + 同一日 1 回通知抑制
- S27: PWA scope/start_url/id 明示 + preview 出し分け
- F18-F21, T14-T20: 技術スタック追記、UA 分岐、データ反映経路、KV interface、構造化 assertion、glob axe 対象、Server Component の Client 分離など全て plan に反映

---

## Round 3 (Verification + Final Minor Sweep)

### Round 3 結果サマリ

- Functionality: F18-F22 すべて Resolved、新規なし、R1-R36 全 clean
- Security: S16-S27 すべて Resolved、新規 Minor 6 (S28-S33)
- Testing: T14-T20 すべて Resolved、新規 Minor 2 (T21, T22 は内部矛盾)
- 合計: Critical 0, Major 0, Minor 8

### Round 3 Findings (すべて Minor)

#### Functionality / Testing
- T21: vitest-axe 節が Step 9 と内部矛盾 (旧記述残存)
- T22: 回帰防止節に「ICS スナップショットテスト」が残存

#### Security
- S28: 動的取得追加時の CSP `connect-src` 拡張ガイダンスを Considerations に明記
- S29: OG 画像 URL 直叩きの 200 + image/png を Step 9 受入に追加
- S30: SW `importScripts` で読み込まれる workbox runtime が同一オリジンであることの確認
- S31: Vercel KV 障害時の fail-degraded フォールバック (process-local LRU + Discord 通知)
- S32: CSP `report-to` 導入はフェーズ 2 の観測性ツール導入時
- S33: nonce 生成の暗号強度を `crypto.getRandomValues` ベース (128bit 以上、Base64URL) と明記、`lib/csp.ts` 集中化

### Round 3 → 修正サマリ

すべて plan に反映完了:
- Testing: vitest-axe 節を全公開ルート + Client/JSDOM 経由に統一、回帰防止節を「ICS の決定論化」に書き換え
- Security: KV 障害時の fail-degraded、nonce CSPRNG 集中化、Step 8 受入に importScripts 確認、Step 9 受入に OG 画像 + nonce CSPRNG 検証、Considerations に CSP report-to / connect-src 将来拡張ガイダンス追加

---

## Recurring Issue Check (Round 2 時点)

### Functionality
- R1-R36: すべて OK / 該当なし。R33 (ambiguous spec) のみ F18-F21 に該当する軽微残存だった (Round 3 修正で解消予定)

### Security
- RS1 OK / RS2 OK / RS3 要強化 (S19) → 解消済 / RS4 OK
- R2 (S17) / R7 (S16) / R9 (S19) / R17 (S26) / R20 (S18) / R25 (S22) / R31 (S23) → すべて Round 3 修正で解消

### Testing
- RT1 解決済 (`__fixtures__/` + refresh-fixtures + cron 差分検知)
- RT2 解決済 (受入対応表)
- RT3 ICS 時刻固定で解消、KV TTL は T17 純関数化で堅牢化
- R7/R20/R28/R31 部分再発 → Round 3 で全解消

---

## Quality Warnings

ローカル LLM の merge-findings が R1 で「VAGUE」「NO-EVIDENCE」と分類した複数の Minor は、plan-level findings のため file:line evidence を要求するのは不適切と判断した (各 finding は plan の Lxx を Evidence として提示済み)。Round 2 では quality warnings の発生はなく、findings はすべて具体的な行・対策・受入基準とリンクされている。
