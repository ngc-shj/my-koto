# Code Review: perf-cache-and-dev-sw-cleanup
Date: 2026-05-05
Review round: 1

## Changes from Previous Round

Initial code review on the post-rebase `feature/perf-cache-and-dev-sw-cleanup` branch (4 commits off `origin/main`). Phase 2 self-R-check already addressed R16 (3 error-path no-store fixes) + M1 (case 2 cachesKeys assertion); this round is incremental.

## Functionality Findings

### [F1] Major: Inline bootstrap unregisters BEFORE deleting caches — inverted vs killer SW

- **File**: [lib/dev-sw-kill.ts:42-46](lib/dev-sw-kill.ts#L42-L46) and the `DEV_SW_KILL_SCRIPT` string body.
- **Evidence**: `runDevSwKill` and the IIFE wrapper both perform `await Promise.all(targets.map(r => r.unregister()))` BEFORE `cachesKeys → cachesDelete`. The killer SW at [scripts/dev-sw-killer.js](scripts/dev-sw-killer.js) does the opposite: cache delete first, unregister last.
- **Impact**: Behavioural correctness is fine (caches are page-scoped and outlive the SW), but the two cleanup mechanisms now diverge on order. Future readers must reason about whether the difference is intentional. C6 explicitly mandated unregister-last in the killer SW for `client.navigate()` ordering reasons; the inline bootstrap should follow the same convention for design coherence.
- **Fix**: Swap steps 5/6 in both `runDevSwKill` and `DEV_SW_KILL_SCRIPT` so cache delete runs first.

### [F2] Minor: `suppressHydrationWarning` on `<html>` is broader than necessary

- **File**: [app/layout.tsx:62](app/layout.tsx#L62) (pre-existing on `origin/main`).
- **Evidence**: The `<html>`-level suppression exists because `data-nonce` is conditionally spread per request. The new `<script>`-level suppression added in this PR is correctly scoped.
- **Impact**: No functional bug — `suppressHydrationWarning` on a parent does NOT propagate to children. The pattern matches Next.js convention.
- **Fix**: No change.

### [F3] Minor: `install-dev-sw-killer.mjs` throws on fresh clone where `public/` does not exist

- **File**: [scripts/install-dev-sw-killer.mjs:13](scripts/install-dev-sw-killer.mjs#L13).
- **Evidence**: `readdirSync(publicDir)` is called unconditionally; on a fresh clone where `public/` was removed for any reason, `npm run dev` blocks with `ENOENT`.
- **Impact**: Low (current repo always has `public/` because of `icons/` + `manifest.json`), but the script lacks robustness.
- **Fix**: Add `existsSync` + `mkdirSync({ recursive: true })` guard.

## Security Findings

### [S1] Minor: `runDevSwKill` always wipes caches even when `targets.length === 0`

- **File**: [lib/dev-sw-kill.ts:45-46](lib/dev-sw-kill.ts#L45-L46).
- **Evidence**: After filtering `targets`, `cachesKeys` and `cachesDelete` always run. Documented as intentional in self-R-check M1 fix.
- **Impact**: No security consequence; caches were already deletable by the page. Behavioural surprise only.
- **Fix**: Already documented in test (case 2 comment + Phase 3 T1 assertion). No code change.

### [S2] Minor: Install-script regex matches future hand-authored `sw-*.js` files

- **File**: [scripts/install-dev-sw-killer.mjs:10](scripts/install-dev-sw-killer.mjs#L10).
- **Evidence**: `^(sw|workbox-|worker-|fallback-).*\.js(\.map)?$` would match `public/sw-utils.js` if such a file ever existed. No current files match.
- **Impact**: Latent hazard; deletion only fires on `npm run dev`.
- **Fix**: Anchor the `sw` arm to literal `sw\.js[.map]` so prefix-style helpers are not matched.

### [S3] Minor (informational): `suppressHydrationWarning` on inline `<script nonce>` does not mask a real CSP issue

- **File**: [app/layout.tsx](app/layout.tsx).
- **Evidence**: React 19 strips `nonce` attributes from the DOM after hydration to prevent leaks via `element.getAttribute('nonce')`. SSR emits the nonce, the browser's preload-scanner / inline-execution path uses it for CSP enforcement, and React strips it for client-side reads. The mismatch is benign.
- **Impact**: None.
- **Fix**: No change.

### [S4-S8] Minor / Informational

- POIS_CACHE 24h SWR is safe (no PII in Overpass responses).
- sessionStorage cache validates via `safeParse` on read.
- No spurious CSP reports in dev (script carries valid nonce).
- predev/build path isolation is correct.
- `/api/weather` SW regex is anchored; query-string injection bounded by `maxEntries: 4`.

## Testing Findings

### [T1] Minor: Case 2 should also assert `cachesDelete` was NOT called

- **File**: [lib/dev-sw-kill.test.ts](lib/dev-sw-kill.test.ts) case 2.
- **Evidence**: With `cacheKeys: []` (default), `cachesDelete` is naturally never invoked, but no assertion confirms this. A future regression that called `cachesDelete` unconditionally would still pass.
- **Fix**: Add `expect(deps.cachesDelete).toHaveBeenCalledTimes(0)`.

### [T2] Minor: Cases 3 and 4 do not assert that `cachesKeys` was NOT called

- **File**: [lib/dev-sw-kill.test.ts](lib/dev-sw-kill.test.ts) cases 3 and 4.
- **Evidence**: Cases 3 and 4 assert `getRegistrations` is not called but leave `cachesKeys` unguarded. A regression that moved the cache wipe before the flag check would not be caught.
- **Fix**: Add `expect(deps.cachesKeys).not.toHaveBeenCalled()` and `expect(deps.cachesDelete).not.toHaveBeenCalled()`.

### [T5] Minor: SSR test in client-cache.test.ts does not assert sessionStorage was bypassed

- **File**: [lib/client-cache.test.ts:115](lib/client-cache.test.ts#L115).
- **Evidence**: Test stubs `window` to `undefined` and asserts the result equals the network payload. If the production guard at `lib/client-cache.ts:26` were removed, the mock fetch would still return the same payload — silent green on a real regression.
- **Fix**: Spy on `Storage.prototype.getItem`, assert `not.toHaveBeenCalled()` after the SSR call.

### [T9] Minor (informational): `app/map/MapClient.test.tsx` reimplements URL-construction logic instead of intercepting `fetch`

- **Evidence**: The test file builds the expected URL itself instead of mounting `MapClient` and capturing the actual fetch call. Trade-off accepted because no E2E framework exists.
- **Fix**: Out-of-scope refactor (would require extracting `buildPoisUrl` into a shared module).

## Adjacent Findings

- [Adjacent — testability from T9]: Extracting `buildPoisUrl` into a shared module would let MapClient and its test share one helper. Out of scope for this plan.

## Quality Warnings

None — every finding has File / Evidence / Impact / Fix.

## Recurring Issue Check

### Functionality expert
- R1 (utils reuse), R2 (constants), R3 (consumer scope), R4-R15 (contracts), R17-R30 (schema/SW/layout): clean.
- R16 (no-store on errors): pre-fix from self-R-check, verified clean.

### Security expert
- R1-R15 (injection, auth, secrets, CSP, headers): clean.
- R16-R22 (cache, validation): clean (S1 noted as design-intent only).
- R23-R37: clean / N/A (no XSS surfaces, no new deps, no env leak).
- RS1-RS4: clean.

### Testing expert
- R1-R20 (truth-table, mock-reality, smoke, env, jsdom): clean (T1, T2, T5 minors noted).
- RT1-RT5: clean.

## Resolution Status

### F1 Major — inline bootstrap order — Applied
- Action: Swapped step 5/6 in both `runDevSwKill` and `DEV_SW_KILL_SCRIPT` so cache delete runs before unregister, mirroring the killer SW's order. Added an `invocationCallOrder` assertion in case 1 to lock the order.
- Modified files: [lib/dev-sw-kill.ts](lib/dev-sw-kill.ts), [lib/dev-sw-kill.test.ts](lib/dev-sw-kill.test.ts).

### F2 Minor — html-level suppressHydrationWarning — Accepted
- Anti-Deferral check: pre-existing in unchanged scope.
- Justification: pre-existing on `origin/main` from before this branch. Documented; no code change.
- Orchestrator sign-off: pattern is Next.js-standard for nonce propagation; not introduced by this PR.

### F3 Minor — install-dev-sw-killer.mjs needs existsSync guard — Applied
- Action: added `existsSync` + `mkdirSync({recursive: true})` guard before `readdirSync`.
- Modified files: [scripts/install-dev-sw-killer.mjs](scripts/install-dev-sw-killer.mjs).

### S1 Minor — cache wipe with no targets — Accepted
- Anti-Deferral check: acceptable risk (design intent).
- Justification: Worst case = wiping caches that the page already owns (no security impact). Likelihood: only fires when zero same-origin /sw.js registrations exist. Cost to fix: would require gating on targets.length, contradicting the M1 fix decision (clear stale entries even when no SW matched).
- Orchestrator sign-off: documented in test case 2 comment + Phase 3 T1 explicit cachesDelete count assertion.

### S2 Minor — install-script regex too permissive — Applied
- Action: anchored the `sw` arm to literal `sw\.js[.map]` so future hand-authored `sw-*.js` helper files in `public/` are not deleted.
- Modified files: [scripts/install-dev-sw-killer.mjs](scripts/install-dev-sw-killer.mjs).

### S3-S8 — Informational / no fix needed
- All confirmed safe per analysis above.

### T1 Minor — case 2 cachesDelete count — Applied
- Action: added `expect(deps.cachesDelete).toHaveBeenCalledTimes(0)` to case 2.

### T2 Minor — cases 3/4 cachesKeys/cachesDelete unasserted — Applied
- Action: added `expect(deps.cachesKeys).not.toHaveBeenCalled()` and `expect(deps.cachesDelete).not.toHaveBeenCalled()` to both cases.

### T5 Minor — SSR test getItem spy — Applied
- Action: added `vi.spyOn(Storage.prototype, "getItem")` in the SSR test, asserting `not.toHaveBeenCalled()` after the call.
- Modified files: [lib/client-cache.test.ts](lib/client-cache.test.ts).

### T9 Minor (informational) — MapClient test reimplementation — Accepted
- Anti-Deferral check: out of scope (different feature).
- Justification: TODO for a future refactor — extract `buildPoisUrl` into `lib/map/url.ts` (or `config/geo`) so both MapClient and its test call the shared function. Tracked: `TODO(map-pois-url-helper): extract URL constructor for /api/pois into a shared module so the test exercises the production path`.
