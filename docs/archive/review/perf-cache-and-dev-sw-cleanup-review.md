# Plan Review: perf-cache-and-dev-sw-cleanup
Date: 2026-05-05
Review round: 1

## Changes from Previous Round
Initial review.

## Functionality Findings

[F1] Major: C1 walkthrough lists incorrect "default callers" of `jsonResponseHeaders` — only `app/api/weather/route.ts`, `app/api/pois/route.ts`, and `lib/api-shared.test.ts` actually call this helper. After C2/C3 land, the default-arg branch is dead code. Fix: make the cache arg required OR remove Consumer 4 from the walkthrough and document the default exists for future endpoints only.

[F2] Major: C2's `no-store` invariant on 429 cannot be satisfied by changes inside `app/api/weather/route.ts` alone — `rateLimitResponse` in `lib/api-shared.ts` builds the 429 from the success-path Cache-Control. Fix: extend `rateLimitResponse` to override `Cache-Control: no-store` on the 429 path; cover both routes with tests.

[F3] Major: Killer SW activate sequence is missing `clients.claim()` before `client.navigate()`. Without it, `navigate()` resolves to `null` (Chromium) or rejects. Fix: specify ordering — `claim()` → caches.delete → `matchAll({ type: "window" })` → `navigate().catch(() => {})` → `unregister()` LAST.

[F4] Minor: C5 SW URL patterns are unanchored. Fix: use `/^\/api\/weather(?:\?.*)?$/` and `/^\/api\/ics\/.+/`; add forbidden-pattern.

[F5] Minor: F2 hinges on stable URL strings. `MapClient.tsx:218` uses `${snapped.south}` (full float) for the URL while the in-memory ref uses `.toFixed(2)`. Fix: format the URL with `.toFixed(2)`.

[F6] Minor: C7 missing `<script>` render position and missing-nonce fallback. Fix: render as first child of `<head>`; `console.warn` when nonce empty in dev.

[F7] Minor: C0 invariant `*_MS === *_MAX_AGE * 1000` is generic but `POIS_CACHE` has no `_MS`. Fix: scope invariant to `WEATHER_CACHE`.

## Security Findings

[S1] Major: Dev-only inline script gate `process.env.NODE_ENV !== "production"` is a negative match — staging/test/unset environments emit the kill script + dev-CSP. Fix: positive match `=== "development"` + runtime hostname guard `localhost`/`*.local`.

[S2] Major: `Cache-Control: public` + `Vary: Accept-Encoding` is safe only while bodies have zero per-user data. Future engineer adding auth-derived data inherits `public, max-age=...` silently. Fix: encode invariant in C1 — auth-state routes MUST `no-store`. Optional: auto-add `Vary: Cookie, Authorization` when `cache?.maxAge > 0`.

[S3] Major: SW StaleWhileRevalidate persists poisoned upstream content for 1h. `WeatherResponseSchema` permits `temperature_2m_max ∈ [-50, 50]` — almost any number passes. Fix: tighten ranges per Tokyo locale (-10..40 °C) OR add server-side `generatedAt` validated against `< 24h ago`.

[S4] Major: Plan claims `/api/csp-report` exists "recently added" but the endpoint is on `main` only (commit `a3d750b`); current branch (`feature/a11y-furigana`) does not include it, and `lib/csp.ts` does not currently emit `report-to`. Fix: confirm rebase intent in pre-conditions OR remove the claim. Add acceptance asserting `buildCsp(...)` includes `report-to`.

[S5] Minor: sessionStorage namespace `kc:` shared by C4 cache entries and C7 flag. Fix: separate `kc:cache:` and `kc:flag:`.

[S6] Minor: `cachedFetchJson` trusts only Zod schema width; wide ranges allow plausible-but-fake values. (Overlaps S3.) Fix: same as S3 + add storedAt sanity (`storedAt > now` rejected).

[S7] Minor: Killer SW `getRegistrations()` blindly unregisters foreign SWs sharing localhost. Fix: constrain to `scriptURL.endsWith("/sw.js")` with same-origin scope, AND `location.hostname === "localhost"` runtime guard.

[S8] Minor: Plan should reaffirm `notify(...)` flow is unchanged. Fix: C1 invariant "MUST NOT change any `notify(...)` call site"; grep-check.

[S9] Minor (pre-existing): `data-nonce` attribute on `<html>` exposes nonce to same-origin readers. Plan normalizes the anti-pattern. Fix in-plan: read nonce from `headers().get("x-nonce")` directly in walkthrough; flag `data-nonce` removal as adjacent follow-up. escalate: false.

## Testing Findings

[T1] Critical: kill-script idempotency test covers only 2 of 4 truth-table cells. Fix: expand to:
1. flag unset + 2 reg → unregister×2, caches deleted, flag set, reload×1
2. flag unset + 0 reg → no unregister, NO reload, flag NOT set
3. flag set + 2 reg → no unregister, no reload (assert `getRegistrations` is NOT called)
4. flag set + 0 reg → no unregister, no reload

[T2] Major: jsdom 26.x has no `caches` global. Fix: `vi.stubGlobal("caches", { keys, delete })` setup explicitly named in C7 acceptance.

[T3] Major: `location.reload` is non-configurable in jsdom. Fix: `Object.defineProperty(window.location, 'reload', { configurable: true, value: vi.fn() })` pattern documented; restore in afterEach.

[T4] Major: C5 next.config.ts text-grep gives false confidence. Fix: drop the unit-test bullet OR extract runtime-caching rules to `lib/sw-runtime-caching.ts` and unit-test that pure data module.

[T5] Major: SSR-safety test for `cachedFetchJson` proposes `delete window.sessionStorage` which doesn't trigger `typeof window === "undefined"` branch. Fix: split into (1) SSR (`vi.stubGlobal("window", undefined)` or node env) and (2) storage-unavailable (`setItem` throws).

[T6] Major: TTL literals leak into tests despite C0 centralisation. Fix: C0 invariant — test files MUST import constants and interpolate; literal `300`/`3600`/`600` in `*.test.ts` for cache directives is forbidden.

[T7] Minor: No assertion that `app/layout.tsx` actually emits `DEV_SW_KILL_SCRIPT`. Fix: add `renderToString` test asserting the substring is present.

[T8] Minor: Adversarial scenarios lack reproduction steps. Fix: add pre-conditions, exact steps, expected DevTools observations for each scenario.

## Adjacent Findings

- [Adjacent — security/privacy from F2]: caching 429 responses for 5 min also has a security flavour (rate-limit signals leak more freely from disk cache). Routed to Security expert; addressed via the same fix as F2.
- [Adjacent — implementation correctness from T8]: C5 `cacheName: weather-${buildId}` requires next-pwa to interpolate `${buildId}` at SW emit time; verify next-pwa version supports it.

## Quality Warnings

None — all findings have File / Evidence / Problem / Impact / Fix sections.

## Recurring Issue Check

### Functionality expert
- R1: clean
- R2: pre-screened (set-equality)
- R3: pre-screened (POI scope)
- R4: pre-screened (predev confirmed)
- R5: clean (DCE on `process.env.NODE_ENV`)
- R6: clean (SSR guard documented)
- R7: clean (storage quota / private mode)
- R8: clean (abort signal handling)
- R9: clean (idempotency)
- R10: clean (sessionStorage scope)
- R11: F7 (TTL drift)
- R12: clean (race conditions)
- R13: F4 (regex anchoring)
- R14: F4 (workbox rule ordering)
- R15: F3 (clients.claim missing)
- R16: F2 (Cache-Control on errors)
- R17-R37: see func-findings.txt for full audit

### Security expert
- R5 (XSS/CSP): S1, S9
- R12 (info disclosure): S8
- R20 (cache poisoning): S2, S3
- R34 (lazy validation): S3, S6
- RS1: clean
- RS2: clean (rate limit preserved)
- RS3: S1, S9
- RS4: S8

### Testing expert
- R35 (manual test plan): T8
- RT1 (mock-reality): T5
- RT2 (testability): T2, T3
- RT3 (shared constants in tests): T6
- RT4 (race-test guards / idempotency double-branch): T1
- RT5 (test invokes production primitive): T7

---

## Round 2 — verification + new findings (2026-05-05)

All 24 round-1 findings applied to plan and verified. Round 2 surfaced:

**Functionality (5 minor)**: F8 hostname guard incomplete (LAN/IPv6 — overlaps with S10 Major); F9 C2.1 acceptance test misplaced; F10 C1.1 forbidden-pattern brittleness (deferred per Anti-Deferral, see plan); F11 C8 shared-`TemperatureSchema` scope ambiguous; F12 C6 `.js.map` glob omitted.

**Security (1 major + 5 minor)**: S10 (Major) hostname allowlist needs `::1`/`[::1]`/`127.0.0.0/8`/`*.localhost`; S11 weathercode allowlist + time array length cap; S12 namespace versioning; S13 precipitation_probability_max bound verification; S14 `endsWith("/sw.js")` permissive note; S15 forbidden-pattern banning manual `Cache-Control: max-age=...` overrides.

**Testing (2 major + 2 minor)**: T9 (Major) `Object.defineProperty(window.location.reload)` throws in jsdom — refactored to DI pattern with `runDevSwKill(deps)`; T10 (Major) `renderToString` does not handle async layouts — corrected to `await RootLayout(...)` then `renderToString(element)`; T11 boundary test update; T12 swRuntimeCaching test mode clarified.

All round-2 findings applied.

## Round 3 — verification + new findings

All round-2 findings verified resolved. Round 3 surfaced 4 minor:

- F13: C7 wrapper must source `origin` from `window.location.origin` — invariant added.
- F14: WMO_CODES allowlist literal specified (per WMO 4677) in C8.
- T13: `lib/dev-sw-kill.smoke.test.ts` added to C7 acceptance — verifies wrapper string contains the three `window.location.*` literals.
- T14: production-bundle exclusion grep updated to `kc:flag:v1:dev-sw-killed` (matches round-2 namespace versioning).

All round-3 findings applied.

## Round 4 — final spot check

All round-3 items verified RESOLVED. F10 deferral confirmed properly formatted with Anti-Deferral check, Justification (worst case + likelihood + cost), Orchestrator sign-off. Two cosmetic doc-drifts fixed: testing-strategy bullet relocated test to `app/map/MapClient.test.tsx` per F9; rollback note now references all eleven contracts.

**Result: READY TO LOCK CONTRACTS.**

Loop summary: round 1 (24 findings) → round 2 (12 findings, 9 new + 3 resolutions) → round 3 (4 findings) → round 4 (clean except 2 cosmetic). 4 rounds total; well under the 10-round cap.

## Resolution Status (canonical)

All Critical / Major findings: applied to plan or recorded as deferred per Anti-Deferral.

- T1 (idempotency truth table) — Critical — Applied (4 cells).
- F1, F2, F3 — Major — Applied.
- F4-F12 — Minor — Applied (F10 deferred per Anti-Deferral).
- S1-S4, S10 — Major — Applied.
- S5-S9, S11-S15 — Minor — Applied.
- T2-T6, T9, T10 — Major — Applied.
- T7, T8, T11-T14 — Minor — Applied.
- F13, F14, T13, T14 — Minor (round 3) — Applied.
| F13, F14, T13, T14 | Minor (round 3) | Applied |
