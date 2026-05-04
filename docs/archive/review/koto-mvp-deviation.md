# Coding Deviation Log: koto-mvp

## Step 1 (2026-05-04)

1. **Next.js バージョンを `15.5.15` に変更**
   - Plan の暗黙前提 (15.x) に対し、CVE-2025-66478 対策で最新パッチ済みの 15.5.15 を採用。実害なし。
2. **`vitest-axe` を `^0.1.0` に固定**
   - `^1.0.0` は npm 未公開のため `0.1.x` を採用。Step 9 (axe テスト) で機能要件を満たすか再検証する。
3. **Tailwind CSS v4 ベースの構成**
   - Plan は v3 系の `tailwind.config.ts` content 設定を想定していたが、インストール時の最新版が v4 だったため `@tailwindcss/postcss` + `@import "tailwindcss"` 構成に変更。content 自動検出で動作確認済。
4. **CSP `script-src` の本番形 (Step 1 時点)**
   - Plan では本番 `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'` だが、Step 1 時点では `'self' 'strict-dynamic'` のみ。nonce を実 inline-script に適用するのは Step 9 完了点 (移行ロードマップ通り)。`unsafe-eval` / `unsafe-inline` が script-src に含まれない受入基準は満たす。
5. **`postcss` の moderate vulnerability (Next.js 内部依存)**
   - `next@15.5.15` が引きずる postcss<8.5.10 が `npm audit` で moderate を出すが、`audit fix --force` は next を 9.3.3 にダウングレードするため適用不可。アップストリーム待ち。`npm audit --audit-level=high` は pass。
