# Coding Deviation Log: perf-cache-and-dev-sw-cleanup

All 11 contracts (C0..C8) implemented as specified. The deviations below
are exclusively side-fixes discovered during verification, not contract
modifications.

## Side-fix 1 — `app/layout.test.tsx` env mutation pattern

- **Plan text** (C7 acceptance): `process.env.NODE_ENV = "development"` direct assignment in the test.
- **Actual implementation**: `vi.stubEnv("NODE_ENV", "development")` (Vitest built-in).
- **Reason**: `Object.defineProperty(process.env, "NODE_ENV", ...)` is non-configurable in Node 22+; direct assignment also produces unstable results across `vi.resetModules()` boundaries. `vi.stubEnv` is the documented Vitest path and restores cleanly via `vi.unstubAllEnvs()` in `afterEach`.
- **Impact**: zero behavioural — the test asserts the same conditional output. Test consistency improved.

## Side-fix 2 — Self-R-check finding R16

- **Symptom**: `app/api/pois/route.ts:154,157` and `app/api/weather/route.ts:58` returned 500 responses with the cacheable `responseHeaders` (inheriting `max-age=300`/`max-age=3600`). Pre-existing — these branches are dead at runtime (compile-time-constant guards) but would cache 500s if ever exercised.
- **Fix**: switched the three sites to use a `no-store` Headers (errorHeaders helper for pois; inline construction for weather).
- **Why this is fix-not-deviation**: per C2/C3 invariants, every error path MUST emit `no-store`. The Track A sub-agent missed these three guard branches; the self-R-check round caught them per Anti-Deferral (30-minute rule).

## Side-fix 3 — Self-R-check finding M1 (Minor)

- **Symptom**: `lib/dev-sw-kill.test.ts` case 2 (flag unset + 0 registrations) did not assert that `cachesKeys` is called. The production code wipes caches unconditionally — by design, since stale cache entries can persist after a SW is manually unregistered.
- **Fix**: added `expect(deps.cachesKeys).toHaveBeenCalledTimes(1)` to case 2 with a comment explaining the design intent.
- **Why this is fix-not-deviation**: closes a vacuous-pass gap on a path that was already documented in the contract.

## Side-fix 4 — Hydration mismatch on inline `<script nonce>` (post-rebase)

- **Symptom**: after rebase onto origin/main (which brought in React 19 + the new CSP middleware split), `npm run dev` surfaced a hydration mismatch: SSR emits `nonce="<value>"` while React on the client renders the same `<script>` with `nonce=""` because React 19 strips inline-script nonces during hydration to prevent script-injection chaining.
- **Fix**: added `suppressHydrationWarning` to the inline `<script nonce>` in `app/layout.tsx`. The script body is identical on both sides; only the nonce attribute differs, and CSP enforcement runs server-side.
- **Why this is fix-not-deviation**: the plan's C7 contract did not anticipate this React 19 behaviour. The fix preserves the contract (script body is verbatim `DEV_SW_KILL_SCRIPT`, emission still gated by `shouldEmitDevSwKill`).

## Branch-base correction

- **Symptom**: the Phase 1 plan was created from local `main` at commit `6618d2f`, which was 13 commits behind `origin/main` (which was at `9ace99b`). The plan's S4 pre-condition explicitly required rebasing onto the latest `main` so `app/api/csp-report/route.ts` and `lib/csp/reports.ts`'s `report-to` directive would be present.
- **Fix**: pulled `origin/main`, rebased `feature/perf-cache-and-dev-sw-cleanup`, resolved 2 conflicts (both in import blocks where origin/main added `WbgtPanel` / `KanjiText` and this branch added `WeatherResponseSchema` — kept all imports). All 547 tests pass on the rebased state.
- **Acceptance check** (per plan S4):
  - `find app/api/csp-report -name route.ts` → `app/api/csp-report/route.ts` present ✓
  - `grep -c "report-to" lib/csp/policy.ts` (note: file was renamed from `lib/csp.ts` on origin/main) → present ✓
