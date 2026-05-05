# Plan: perf-cache-and-dev-sw-cleanup

## Project context

- **Type**: web app (Next.js 15 App Router + Edge runtime + Vercel KV + next-pwa).
- **Test infrastructure**: unit + integration (`vitest` + `jsdom` + `@testing-library/react`). No E2E framework. No CI/CD pipeline beyond local pre-commit hooks (Ollama-based commit-msg-check).
- **Note for experts**: this is a community-tool web app; recommendations to add a CI pipeline / Playwright / k6 are out of scope for this plan (pre-existing repo limitation).

## Objective

Reduce perceived latency of the weather and POI views (currently every navigation triggers a fresh upstream call), and eliminate the "ハードリロード必須" symptom of `npm run dev` (caused by a previously registered prod Service Worker continuing to intercept requests).

## Requirements

### Functional

- F1: Re-visiting `/weather` (or any page that mounts `WeatherWidget`) within 5 minutes MUST NOT issue a new network request to `/api/weather`.
- F2: Re-visiting `/map` within 1 hour with the same bbox+types MUST reuse the previous `/api/pois` response.
- F3: A successful soft reload of any dev-mode page MUST display the page produced by the running `next dev` server, never a stale response served by a previously-registered prod Service Worker.
- F4: Production behaviour of the existing PWA Service Worker (offline fallback, asset caching, Web Push reception) MUST remain unchanged.

### Non-functional

- NF1: Browser cache reuse window for `/api/weather` = 5 min (Open-Meteo updates hourly; a 5-min window is well within freshness budget).
- NF2: Browser cache reuse window for `/api/pois` = 1 hour (Overpass / OSM data changes infrequently; matches the existing server-side KV TTL).
- NF3: The dev SW cleanup MUST self-evict — the killer SW must not stay registered, and must not need a manual `Application > Unregister` step in DevTools.
- NF4: All new client-side logic MUST be SSR-safe (Next.js App Router renders on the server before hydration).

## Technical approach

Two independent tracks, both shipping in this plan:

### Track A — Layered caching for `/api/weather` and `/api/pois`

Three layers, from cheapest to most expensive cache:

1. **HTTP browser cache**: extend `Cache-Control` to include `max-age=...` and `stale-while-revalidate=...` — `s-maxage` alone (current state) only helps the CDN, never the browser.
2. **In-page client cache** (sessionStorage TTL for `/api/weather`; in-memory LRU for `/api/pois` because bbox is geo-sensitive and not safe to share across tabs): handles the case where the browser cache misses (devtools "Disable cache" toggle, hard navigations, cross-origin redirects).
3. **Service Worker** runtime cache: `/api/weather` switches from `NetworkOnly` to `StaleWhileRevalidate` so offline / slow-network sessions get instant render and revalidate in background. `/api/ics/*` stays `NetworkOnly` (file downloads must never be SW-cached). `/api/pois` is intentionally NOT added to SW cache (bbox-keyed cardinality blows out cache budget).

`/api/pois` consumer scope (clarification — addresses pre-screen R3-1): the only consumer is [`app/map/MapClient.tsx:221`](app/map/MapClient.tsx#L221), which already maintains an in-memory `fetchedBboxesRef` keyed on snapped-bbox+types ([line 206-213](app/map/MapClient.tsx#L206-L213)) and dedupes within a mount. F2 is satisfied by combining that existing dedupe with the new HTTP `max-age=3600` from C3 — same snapped bbox revisited across mounts hits the browser cache. NO migration to `cachedFetchJson` is performed for POIs (sessionStorage is the wrong shape for geo-keyed cardinality, and the in-memory ref already covers within-mount dedupe).

The existing server-side KV cache (`/api/weather` 1h TTL, `/api/pois` per-bbox 1h TTL) is preserved untouched — Track A adds layers IN FRONT of it.

### Track B — Dev SW cleanup

`next-pwa`'s `disable: isDev` only stops the SW from being **generated**; it does not unregister an SW that a previous `npm run build && npm run start` session left in the browser. Solution: install a one-shot **killer SW** at `public/sw.js` whenever `next dev` runs.

Implementation:

1. **`predev` script** (`scripts/install-dev-sw-killer.ts`):
   - Copy `scripts/dev-sw-killer.js` (committed source) → `public/sw.js`
   - Remove `public/workbox-*.js`, `public/worker-*.js`, `public/fallback-*.js` if present
   - Idempotent; safe across repeat invocations

2. **Killer SW source** (`scripts/dev-sw-killer.js`):
   - On `install` → `self.skipWaiting()`
   - On `activate` → delete every cache name from `caches.keys()`, then `self.registration.unregister()`, then reload every controlled client by calling `client.navigate(client.url)`
   - **No `fetch` handler** — must not intercept any request, otherwise it perpetuates the very problem it is solving

3. **Belt-and-suspenders dev-only inline bootstrap** (`app/layout.tsx` + `lib/dev-sw-kill.ts`):
   - When `process.env.NODE_ENV !== "production"`, layout emits an inline `<script nonce>` that, if `'serviceWorker' in navigator` and `sessionStorage["kc:dev-sw-killed"]` is unset:
     - Iterates `navigator.serviceWorker.getRegistrations()` and unregisters each
     - Iterates `caches.keys()` and deletes each
     - Sets the sessionStorage flag and reloads ONCE
   - Production builds tree-shake the import (compile-time `process.env.NODE_ENV` check), so the bootstrap byte-string MUST NOT appear in `.next/static/**` after `next build`.

The killer SW handles the case where the registered prod SW intercepts the request and returns a cached page (so the inline script never runs). The inline bootstrap handles the case where the SW is somehow not updated immediately.

## Contracts

### C0 — Centralised TTL constants in `config/cache.ts`

- **Diff intent**: new file `config/cache.ts` exports the TTL/freshness numbers that other contracts reference. Reading constants from here (instead of inline literals) keeps Track A drift-free.
- **Signature**:

  ```ts
  // All values in seconds unless suffixed with _MS.
  export const WEATHER_CACHE = {
    BROWSER_MAX_AGE: 300,            // 5 min
    SHARED_MAX_AGE: 3600,            // 1 h
    STALE_WHILE_REVALIDATE: 600,     // 10 min
    STALE_IF_ERROR: 86400,           // 24 h
    CLIENT_TTL_MS: 5 * 60_000,
  } as const;
  export const POIS_CACHE = {
    BROWSER_MAX_AGE: 3600,
    SHARED_MAX_AGE: 3600,
    STALE_WHILE_REVALIDATE: 86400,
    STALE_IF_ERROR: 86400,
  } as const;
  ```

- **Invariants**:
  - For `WEATHER_CACHE` only: `CLIENT_TTL_MS === BROWSER_MAX_AGE * 1000`. (Round-1 F7: this invariant is per-bucket; `POIS_CACHE` has no `_MS` because POIs do not use sessionStorage TTL.)
  - **Test-side enforcement** (round-1 T6): every `*.test.ts` that asserts a Cache-Control directive value MUST import the constant from `config/cache.ts` and interpolate (e.g., `` expect(cc).toContain(`max-age=${WEATHER_CACHE.BROWSER_MAX_AGE}`) ``). Hardcoded numeric literals (`300`, `3600`, `600`, `86400`, `5 * 60_000`) for cache values in `*.test.ts` are forbidden.
- **Forbidden patterns**:
  - pattern: `(max-age|s-maxage|stale-while-revalidate|stale-if-error)=(300\|600\|3600\|86400)` inside `*.test.ts` files asserting on `Cache-Control` — reason: enforce single source of truth from `config/cache.ts`.
- **Consumer-flow walkthrough**:
  - Consumers: `app/api/weather/route.ts`, `app/api/pois/route.ts`, `components/WeatherWidget.tsx`, `app/weather/page.tsx`. Each imports the relevant constant; no consumer hard-codes the literal value.
  - Test consumers: every test file that asserts cache directive values imports the same constants — guarantees test-source coherence.

### C1 — `jsonResponseHeaders` accepts a per-route freshness option

- **Signature** (extends [`lib/api-shared.ts:96`](lib/api-shared.ts#L96)):

  ```ts
  export type CacheDirective = Readonly<{
    maxAge: number;            // browser cache (seconds, integer ≥ 0)
    sMaxAge: number;           // shared/CDN cache (seconds, integer ≥ 0)
    staleWhileRevalidate: number; // SWR window (seconds, integer ≥ 0)
    staleIfError: number;      // SIE window (seconds, integer ≥ 0)
  }>;
  export function jsonResponseHeaders(
    allowOrigin: string,
    cache?: CacheDirective,
  ): Headers;
  ```

- **Default behaviour** (when `cache` is omitted): emit a `Cache-Control` value that contains exactly the same set of directive tokens as today (`public`, `s-maxage=3600`, `stale-if-error=86400`). Token order is not asserted (test uses `.toContain(token)` for each token, NOT byte equality — addresses pre-screen R2-2). **Round-1 F1 correction**: there are NO in-tree default-arg consumers — `grep -rn "jsonResponseHeaders(" --include="*.ts"` returns only the two routes touched by C2/C3 plus `lib/api-shared.test.ts`. The default-arg branch exists for the test fixture and any future endpoint that opts into the conservative default; the walkthrough Consumer 4 entry is removed.
- **Invariants**:
  - Each directive token appears at most once per `Cache-Control` value.
  - When `maxAge === 0`, the function emits `no-cache` instead of `max-age=0`.
  - All four input fields are non-negative integers (TS type) — runtime guard not added (trust caller; no external input).
  - **Per-user-data guard (round-1 S2)**: a route MUST pass a positive `cache` arg ONLY if the response body has zero per-user data. Routes that read auth/cookie/identity state MUST omit the arg (default emits `public, s-maxage=3600, stale-if-error=86400`) — but for those routes the correct path is to override with `Cache-Control: no-store` directly via a fresh `Headers`. Today's `weather` and `pois` routes contain no per-user data; the invariant guards future drift.
  - **`notify(...)` chain unchanged (round-1 S8)**: C1 MUST NOT add, remove, or modify any `notify(...)` call site in `lib/api-shared.ts`. The single existing `notify("[koto-city] primary KV failure, fell back to LRU")` call remains the only invocation — verified via grep.
- **Forbidden patterns**:
  - pattern: `Cache-Control[^"\n]*max-age=0[^"\n]*"` — reason: explicit zero-freshness intent must use `no-cache`, not `max-age=0` which some clients still treat as "may serve stale".
  - pattern: `notify\(` in any non-test file under `lib/` not equal to the single existing call — reason: round-1 S8 guard against accidental error-message exfiltration via Discord webhook.
  - pattern (round-2 S15): `\.set\(\s*["']Cache-Control["']\s*,\s*["'][^"']*max-age=` in any `app/api/**/route.ts` file — reason: route handlers MUST NOT manually set a positive `max-age`, bypassing the centralised `jsonResponseHeaders` policy. Allowed manual override values are exactly `no-store` and `no-cache`.
- **Acceptance**:
  - `jsonResponseHeaders(o, { maxAge: 300, sMaxAge: 3600, staleWhileRevalidate: 600, staleIfError: 86400 })` returns headers whose `Cache-Control` value contains all of `public`, `max-age=300`, `s-maxage=3600`, `stale-while-revalidate=600`, `stale-if-error=86400`.
  - `jsonResponseHeaders(o)` (no cache arg) emits a `Cache-Control` header whose split-by-comma trimmed token set equals `{ "public", "s-maxage=3600", "stale-if-error=86400" }` (asserted via Set comparison, not string equality).
- **Consumer-flow walkthrough**:
  - Consumer 1 — [`app/api/weather/route.ts`](app/api/weather/route.ts) (path: `app/api/weather/route.ts:28`) reads `{ Headers }` and uses the returned object as the base for every Response (200/429/502/503). Operation: `new Headers(responseHeaders)` + per-status overrides. Required field: a Headers object that supports `.set()` and clone via `new Headers()`.
  - Consumer 2 — [`app/api/pois/route.ts`](app/api/pois/route.ts) (path: `app/api/pois/route.ts:31`) — same shape.
  - Consumer 3 — [`lib/api-shared.test.ts`](lib/api-shared.test.ts) reads `Cache-Control` via `headers.get("Cache-Control")` and asserts substring tokens; will be extended for the new arg form.
  - Consumer 4 — existing default callers (`app/api/push/dispatch/route.ts`, `app/api/push/subscribe/route.ts`, `app/api/ics/events/route.ts`, `app/api/ics/gomi/[district]/route.ts`) — DO NOT pass the new arg. Their `Cache-Control` output must be byte-identical to today (regression risk).

### C1.1 — `rateLimitResponse` overrides Cache-Control to `no-store` on 429

(Round-1 F2 — newly added contract.)

- **Diff intent**: at [`lib/api-shared.ts:81-94`](lib/api-shared.ts#L81-L94), inside `rateLimitResponse`, when the rate-limit decision returns `ok: false`, REPLACE the inherited `Cache-Control` with `no-store` (and drop any `s-maxage` / `stale-while-revalidate` / `stale-if-error` directives) before emitting the 429 response. The `Retry-After` header continues to be set.
- **Signature**: unchanged (pure-internal behaviour change).
- **Invariants**:
  - 429 responses NEVER carry a positive `max-age`, `s-maxage`, `stale-while-revalidate`, or `stale-if-error`.
  - Success-path callers' headers (`responseHeaders` passed to `rateLimitResponse`) are NOT mutated — `rateLimitResponse` clones via `new Headers(baseHeaders)` then overrides on the clone.
- **Forbidden patterns**:
  - pattern: `status:\s*429[\s\S]{0,400}max-age=` in any handler — reason: a 429 advertising freshness pins user-facing rate-limit-error in browser disk cache.
- **Acceptance**:
  - `lib/api-shared.test.ts` adds case `"rateLimitResponse 429 emits Cache-Control: no-store and drops s-maxage"`.
  - `app/api/weather/route.test.ts` and `app/api/pois/route.test.ts` add case `"429 response carries Cache-Control: no-store"` (verifies route-level inheritance).
- **Consumer-flow walkthrough**:
  - Consumer: every Edge route that calls `rateLimitResponse(request, cfg, baseHeaders)` (today: `/api/weather`, `/api/pois`; future routes by reflex per RS2). On 429, the response Headers carry `Cache-Control: no-store` regardless of what `baseHeaders` carried. Consumers do not need to override anything.

### C2 — `/api/weather` emits browser-cacheable headers on success

- **Diff intent**: at [`app/api/weather/route.ts:28`](app/api/weather/route.ts#L28), pass `{ maxAge: 300, sMaxAge: 3600, staleWhileRevalidate: 600, staleIfError: 86400 }`.
- **Invariants**:
  - 200 responses include `max-age=300` and `stale-while-revalidate=600`.
  - 429/502/503 responses MUST NOT include a positive `max-age` (errors must not pin in browser cache). The simplest path: error branches construct a fresh `Headers` with `Cache-Control: no-store`.
  - The `X-Cache: STALE` header on the KV-stale-fallback path is preserved.
- **Forbidden patterns**:
  - pattern: `status:\s*(429\|502\|503)` adjacent to `max-age=` in `app/api/weather/route.ts` — reason: error responses must not advertise positive freshness.
- **Acceptance**:
  - `app/api/weather/route.test.ts` adds case `"200 includes max-age=300 and stale-while-revalidate=600"`.
  - Existing case `"returns Cache-Control with s-maxage=3600 and stale-if-error=86400"` updated to also assert `max-age=300` and `stale-while-revalidate=600`.
  - New case `"502 has Cache-Control: no-store"` passes.

### C2.1 — `MapClient` POI URL canonicalisation

(Round-1 F5 — newly added contract.)

- **Diff intent**: at [`app/map/MapClient.tsx:218`](app/map/MapClient.tsx#L218), format every `snapped.{south,west,north,east}` value with `.toFixed(2)` when constructing the `bbox=` query string. This makes the request URL byte-identical across mounts that snap to the same grid cell, so the browser's HTTP cache (max-age=3600 from C3) is hit even after the in-memory `fetchedBboxesRef` has been reset by an unmount.
- **Invariants**:
  - The `.toFixed(2)` precision matches the in-memory `cacheKey` precision at line 208 — both surfaces use the SAME canonicalisation.
  - The server-side bbox parser `parseBboxParam` ([`app/api/pois/route.ts:49`](app/api/pois/route.ts#L49)) uses `Number(s.trim())` and treats `35.67` and `35.6700` as equal — the canonicalisation does NOT reduce server-side precision; it only stabilises the URL string.
- **Forbidden patterns**:
  - pattern: `\$\{snapped\.(south\|west\|north\|east)\}` in MapClient (without `.toFixed`) — reason: floats embedded directly produce non-canonical URLs.
- **Acceptance**:
  - **Round-2 F9 correction**: place the URL-canonicalisation regression test in a NEW `app/map/MapClient.test.tsx` (or augment an existing MapClient test), NOT in `lib/map/snap.test.ts`. The pure `snapBbox` function is already tested in its own file; URL-construction assertions belong with the consumer (MapClient). Test case: render MapClient, simulate two `idle` map events whose viewport bboxes round to the same `.toFixed(2)` snapped grid, assert the two `fetch("/api/pois?...")` calls receive byte-identical URL strings.

### C3 — `/api/pois` emits browser-cacheable headers on success

- **Diff intent**: at [`app/api/pois/route.ts:31`](app/api/pois/route.ts#L31), pass `{ maxAge: 3600, sMaxAge: 3600, staleWhileRevalidate: 86400, staleIfError: 86400 }`.
- **Invariants**: identical to C2 (error responses → `no-store`).
- **Forbidden patterns**: identical to C2 (substituting `pois` for `weather`).
- **Acceptance**: `app/api/pois/route.test.ts` adds `200` and `400/502 no-store` cases analogous to C2.

### C4 — `lib/client-cache.ts` — sessionStorage TTL fetch helper

- **Signature** (new file):

  ```ts
  export type CachedFetchOptions = Readonly<{
    ttlMs: number;
    signal?: AbortSignal;
    now?: () => number; // injectable for tests; defaults to Date.now
  }>;
  // Schema parameter is typed as Zod's runtime-validator surface so callers
  // pass an existing schema like `WeatherResponseSchema` directly, no adapter.
  // (Addresses pre-screen R1-1: reuse zod's safeParse pattern instead of a
  // bespoke SafeParser type.)
  import type { ZodType } from "zod";
  export async function cachedFetchJson<T>(
    cacheKey: string,
    url: string,
    schema: ZodType<T>,
    opts: CachedFetchOptions,
  ): Promise<T>;
  ```

- **Storage layout** (sessionStorage key namespace): `kc:cache:v1:<cacheKey>` → JSON `{ storedAt: number, data: T }`.
- **Invariants**:
  - Fresh hit (`now() - storedAt < ttlMs`) MUST return cached data WITHOUT issuing a network request.
  - The cached value MUST pass `schema.safeParse` before being returned. A parse failure replaces the entry with the next network result.
  - `sessionStorage.setItem` failures (quota exceeded / private mode) MUST NOT throw — the function returns the network result anyway.
  - Aborted requests (signal aborted) MUST NOT poison the cache — no write on abort.
  - SSR safety: when `typeof window === "undefined"`, skip cache lookup AND skip cache write; just `fetch + parse + return`. (The helper is only meant to be invoked in client components, but defensive guard prevents future SSR misuse from crashing the build.)
- **Forbidden patterns**:
  - pattern: `localStorage\.` in `lib/client-cache.ts` — reason: TTL data must not survive tab close; sessionStorage is the only correct backing store.
- **Acceptance** (covered by `lib/client-cache.test.ts`):
  - Two consecutive calls within `ttlMs` → exactly one `fetch` invocation.
  - Cached value that fails `safeParse` → re-fetched; sessionStorage entry replaced with the new value.
  - `setItem` throwing (mocked) → function still returns parsed network response.
  - Abort during fetch → caller receives `AbortError`; sessionStorage unmodified.
  - SSR-mode (jsdom `delete window.sessionStorage`) → falls through to fetch path without throwing.
- **Consumer-flow walkthrough**:
  - Consumer 1 — [`components/WeatherWidget.tsx`](components/WeatherWidget.tsx#L17) replaces direct `fetch("/api/weather")` with `cachedFetchJson("weather:v1", "/api/weather", WeatherResponseSchema, { ttlMs: 5 * 60_000, signal: controller.signal })`. Reads `data` (a `WeatherResponse`) and uses `data.daily.{time, temperature_2m_max, temperature_2m_min, precipitation_probability_max}` to render.
  - Consumer 2 — [`app/weather/page.tsx`](app/weather/page.tsx#L21) — same call shape, same `data.daily` field access.
  - Both consumers' fetched data path is identical — they read the SAME fields from the cached `WeatherResponse`. No producer-consumer field gap.

### C5 — Service Worker `runtimeCaching` split (extracted to a pure data module)

- **Diff intent**:
  1. Extract the `runtimeCaching` array out of [`next.config.ts:65-96`](next.config.ts#L65-L96) into a new pure-data module `lib/sw-runtime-caching.ts` (export `swRuntimeCaching(buildId: string)` returning the array). `next.config.ts` imports and passes the array to next-pwa. This makes the rules unit-testable without loading `withPWAInit` side-effects (round-1 T4).
  2. Replace the single `/api/(weather|ics/.*)` `NetworkOnly` rule with TWO rules. **Both URL patterns are anchored** (round-1 F4):
     - `urlPattern: /^https?:\/\/[^/]+\/api\/weather(?:\?[^#]*)?$/` → `StaleWhileRevalidate`, cacheName `weather-${buildId}`, expiration `{ maxEntries: 4, maxAgeSeconds: 3600 }`.
     - `urlPattern: /^https?:\/\/[^/]+\/api\/ics\/[^?#]+/` → `NetworkOnly` (unchanged).
- **Invariants**:
  - `/api/ics/*` MUST remain `NetworkOnly` (file downloads must not be cached by SW).
  - `cacheName` MUST be `${buildId}`-suffixed so prod redeploys evict old caches. **Verification of next-pwa template-string behaviour** (round-1 T8 adjacent): the extracted data module accepts the buildId as a parameter, so the cacheName is interpolated by application code BEFORE next-pwa sees it. This sidesteps the question of whether next-pwa interpolates `${...}` itself.
  - `/api/pois` is NOT added to SW cache (intentional — bbox cardinality unbounded).
  - The anchored regex MUST NOT match `/api/weatherings`, `/api/weather-archive`, or any other sibling route. Test `swRuntimeCaching("test").find(r => r.handler === "StaleWhileRevalidate").urlPattern` against `new URL("/api/weatherings", "http://x").href` and assert no match.
- **Forbidden patterns**:
  - pattern: `urlPattern[^"]*\/api\/\(weather\|ics` — reason: the union rule is being split; if the diff still contains the union, the split is incomplete.
  - pattern: `\/api\/weather(?!\(\?:|\$)` inside `lib/sw-runtime-caching.ts` — reason: an unanchored `/api/weather` matches `/api/weatherings` etc. (round-1 F4). The pattern must end with `(?:\?[^#]*)?$` or equivalent boundary.
- **Acceptance**:
  - `lib/sw-runtime-caching.test.ts` (new) — **Round-2 T12 clarification**: the test asserts each rule's `urlPattern` regex via `.test(string)` against full URL strings (e.g., `"http://localhost:3000/api/weather?lang=ja"`). The test does NOT instantiate workbox or build a `Request` object; it tests the regex shape directly. Cases: pattern matches `http://x/api/weather`, `http://x/api/weather?lang=ja`, but NOT `http://x/api/weatherings`, `http://x/api/weather-archive`, `http://x/api/weather/foo`. Second rule matches `http://x/api/ics/events`, `http://x/api/ics/gomi/koto-city` but NOT `http://x/api/ics`.
  - `next.config.ts` imports the data module; line count of `next.config.ts` decreases.
  - **Testing-strategy note removed**: the previously-listed "next.config.ts grep test" is REPLACED by the data-module unit test above (round-1 T4: text-grep on `next.config.ts` source proves nothing about emitted `public/sw.js`; the pure-data module is the actual surface to assert).
  - Manual verification (R35 manual-test artifact): after `npm run build`, `grep "weather" public/sw.js` shows the `StaleWhileRevalidate` strategy. This is the SAME manual step previously listed; it is preserved.

### C6 — `predev` installs the dev SW killer

- **Diff intent**:
  1. New file `scripts/dev-sw-killer.js` — committed killer SW source.
  2. New file `scripts/install-dev-sw-killer.ts` — predev script that copies the killer SW into `public/sw.js` and removes any other next-pwa-generated artifacts in `public/`.
  3. `package.json` adds `"predev"`. Pre-existing `"dev": "next dev"` ([package.json:6](package.json#L6)) is the npm convention that triggers `predev` automatically (addresses pre-screen R4-1 — confirmed `dev` script exists, so the predev hook fires). The project does NOT currently depend on `tsx`; the install script ships as `scripts/install-dev-sw-killer.mjs` (plain Node ESM, no transpile) so `predev` is just `"node scripts/install-dev-sw-killer.mjs"`.
- **Killer SW source contract** (`scripts/dev-sw-killer.js`):
  - Has handlers ONLY for `install` and `activate`.
  - On `install`: calls `self.skipWaiting()`.
  - On `activate`: executes the following ordered steps inside `event.waitUntil(...)` — order is REQUIRED per round-1 F3:
    1. `await self.clients.claim()` — take control of all clients FIRST. Without this, `client.navigate()` resolves to `null` (Chromium) or rejects (other engines) because `navigate()` only works on clients controlled by the calling SW.
    2. `const cacheKeys = await caches.keys()` then `await Promise.all(cacheKeys.map(k => caches.delete(k)))`.
    3. `const wins = await self.clients.matchAll({ includeUncontrolled: true, type: "window" })` — `type: "window"` is REQUIRED because `client.navigate()` only exists on `WindowClient`; non-window clients (workers) would throw.
    4. `await Promise.all(wins.map(c => c.navigate(c.url).catch(() => {})))` — `.catch()` is REQUIRED because `navigate()` can reject if the URL is cross-origin or the client moved away.
    5. `await self.registration.unregister()` LAST — unregister AFTER navigations are in flight so the calling SW remains valid for step 4.
  - **Same-origin / known-SW guard** (round-1 S7): the killer SW does NOT need an extra origin guard — it runs only inside its OWN registration, so `caches.keys()` returns only this origin's caches and `registration.unregister()` only unregisters itself. Cross-origin SW state is unaffected. The "blindly unregisters foreign SWs" concern from S7 applies to the C7 inline bootstrap (handled there), not to the SW itself.
  - MUST NOT register a `fetch` event listener.
  - MUST NOT call `clients.openWindow(...)` or any cross-origin API.
  - First line is a comment indicating its purpose (`// koto-city dev-only Service Worker killer — see plan C6`).
- **Install script contract**:
  - Removes `public/sw.js`, `public/workbox-*.js`, `public/worker-*.js`, `public/fallback-*.js`, AND their `.js.map` siblings (round-2 F12 — sourcemap files emitted by next-pwa would otherwise persist, polluting DevTools source-map resolution). Uses Node `fs.readdirSync` + regex, no shell expansion.
  - Then writes the killer SW source to `public/sw.js`.
  - Idempotent — safe to run twice in a row with no error.
  - MUST NOT delete anything in `public/` outside the four glob patterns above. In particular, MUST NOT touch `public/icons/`, `public/manifest.json`.
  - Exits with code 0 on success.
- **Invariants**:
  - The install script never runs in `next build` path. (It is wired to `predev`, not `prebuild`.)
  - `next build` regenerates `public/sw.js` via next-pwa, overwriting the killer.
- **Forbidden patterns**:
  - pattern: `addEventListener\(['"]fetch` in `scripts/dev-sw-killer.js` — reason: a fetch handler turns the killer into yet another interceptor.
  - pattern: `rm\s+-rf\s+public(?!/(sw\|workbox\|worker\|fallback))` — reason: never wipe the entire public dir.
  - pattern: `fs\.rm(Sync)?\([^,)]*public['"]?[\s,)]` (without a glob restriction) — reason: same as above, expressed for the Node path.
- **Acceptance**:
  - After `rm -f public/sw.js && npm run dev` → `public/sw.js` exists and equals `scripts/dev-sw-killer.js`.
  - After `npm run build` → `public/sw.js` is the next-pwa generated SW (different bytes; contains workbox imports).
  - `public/icons/`, `public/manifest.json` are unaffected by either path.

### C7 — Dev-only inline SW-kill bootstrap in layout

- **Diff intent**:
  1. New file `lib/dev-sw-kill.ts` — exports:
     - `runDevSwKill(deps: DevSwKillDeps): Promise<void>` — the dependency-injected kill routine. `DevSwKillDeps` is `{ getHostname: () => string; getRegistrations: () => Promise<readonly ServiceWorkerRegistration[]>; cachesKeys: () => Promise<readonly string[]>; cachesDelete: (key: string) => Promise<boolean>; sessionGet: (key: string) => string | null; sessionSet: (key: string, value: string) => void; reload: () => void; origin: string; }`. The unit test injects mock fns directly; round-2 T9 is resolved because tests never touch `window.location.reload` / `window.location.hostname`.
     - `DEV_SW_KILL_SCRIPT: string` — the inline-emit string body. It is a thin wrapper that constructs a `DevSwKillDeps` from real `window` / `navigator` / `caches` / `sessionStorage` / `location` and calls `runDevSwKill(deps)`. The wrapper itself is shallow enough that tests need not exercise it; the real test target is `runDevSwKill`.
     - `shouldEmitDevSwKill(env: string): boolean` — pure helper, positive match (round-1 S1).
  2. [`app/layout.tsx`](app/layout.tsx) — when `shouldEmitDevSwKill(process.env.NODE_ENV ?? "development") === true` AND the `nonce` is non-empty, render `<script nonce={nonce} dangerouslySetInnerHTML={{ __html: DEV_SW_KILL_SCRIPT }} />` as the FIRST CHILD of `<head>` (round-1 F6 — order matters so the kill runs before any other script that might attempt registration). The condition uses `process.env.NODE_ENV` directly so Next.js dead-code-eliminates the branch in production.
  3. When in dev AND `nonce` is empty, layout emits a `console.warn("[koto-city dev] CSP nonce missing; SW kill bootstrap skipped — verify middleware.ts")` server-side log so the developer notices a misconfiguration (round-1 F6).
- **`shouldEmitDevSwKill(env: string): boolean` contract** (round-1 S1):
  - Returns `true` if and only if `env === "development"` (POSITIVE match — NOT `!== "production"`).
  - `env === "test"`, `env === "staging"`, `env === undefined`, `env === ""` all return `false`. This closes the staging/unset-env loophole identified in S1.
- **`runDevSwKill` behaviour** (described, not bodied):
  - **Step 1 — Loopback hostname allowlist** (round-2 S10 / F8 — replaces the round-1 negative-match guard): compute `h = deps.getHostname()`. Return early UNLESS one of: `h === "localhost"`, `h === "127.0.0.1"`, `h === "::1"`, `h === "[::1]"`, `/^127\./.test(h)`, `h.endsWith(".localhost")`. Note: `*.local` (mDNS) is INTENTIONALLY excluded — Bonjour can publish LAN hostnames like `mac-mini.local` that are not unambiguously dev. The build-time `shouldEmitDevSwKill` gate is the primary defense; this runtime allowlist is belt-and-suspenders.
  - Step 2 (idempotency): if `deps.sessionGet("kc:flag:v1:dev-sw-killed") === "1"` → return. **This check happens BEFORE any other I/O** (round-1 T1 case 3). Namespace `kc:flag:v1:` (round-1 S5 separation + round-2 S12 versioning).
  - Step 3: `regs = await deps.getRegistrations()`.
  - Step 4 (target filter, round-1 S7 / round-2 S14): `targets = regs.filter(r => r.active?.scriptURL.endsWith("/sw.js") && new URL(r.active.scriptURL).origin === deps.origin)`. Sub-path matches like `/foo/sw.js` are intentionally included; same-origin scope is the trust boundary.
  - Step 5: `await Promise.all(targets.map(r => r.unregister()))`.
  - Step 6: `await Promise.all((await deps.cachesKeys()).map(k => deps.cachesDelete(k)))`.
  - Step 7: if `targets.length > 0`: `deps.sessionSet("kc:flag:v1:dev-sw-killed", "1"); deps.reload();`. If `targets.length === 0`: do NOT set the flag (round-1 T1 case 2 — preserves ability to re-fire on next mount when SW shows up later in the dev session).
- **Invariants**:
  - The script body MUST NOT contain `serviceWorker.register(` — it must only unregister.
  - The script MUST NOT trigger more than one reload per browser session (sessionStorage flag).
  - The script MUST NOT unregister SWs whose `scriptURL` does not end in `/sw.js` (round-1 S7).
  - The script MUST short-circuit BEFORE `getRegistrations()` when the flag is set (round-1 T1 case 3 — flag check is the FIRST async-state-touching line).
  - The script MUST NOT set the flag when zero target registrations are found (round-1 T1 case 2 — preserves re-fire potential).
  - **Wrapper sourcing (round-3 F13)**: the `DEV_SW_KILL_SCRIPT` wrapper MUST construct `origin` from `window.location.origin` (NOT a hardcoded string, NOT `document.location.origin`, NOT cached at module load). The wrapper MUST construct `getHostname` as `() => window.location.hostname` and `reload` as `() => window.location.reload()`. These wirings are verified by the smoke test (round-3 T13) that string-greps for `window.location.origin`, `window.location.hostname`, and `window.location.reload` inside `DEV_SW_KILL_SCRIPT`.
  - Production bundle MUST NOT include the script string. Verified by the test below.
- **Forbidden patterns**:
  - pattern: `serviceWorker\s*\.\s*register\s*\(` in `lib/dev-sw-kill.ts` — reason: the kill script must not register anything.
  - pattern: `localStorage\.` in `lib/dev-sw-kill.ts` — reason: dev-killed flag must not persist across browser restarts (developer may legitimately want the kill to re-fire after a restart, e.g., when re-introducing a SW).
  - pattern: `!== "production"` adjacent to `NODE_ENV` in `lib/dev-sw-kill.ts` — reason: round-1 S1 requires positive `=== "development"` match.
- **Acceptance** (round-1 T1 / T2 / T3 / T7; round-2 T9 / T10):
  - `lib/dev-sw-kill.test.ts` (new) — DOES NOT touch `window.location.reload` / `window.location.hostname` (round-2 T9: those properties are non-configurable in jsdom 26.x). Tests call `runDevSwKill(mockDeps)` directly with mocked `DevSwKillDeps`. Example shape:

    ```ts
    const deps = {
      getHostname: () => "localhost",
      getRegistrations: vi.fn().mockResolvedValue([{ active: { scriptURL: "http://localhost:3000/sw.js" }, unregister: vi.fn().mockResolvedValue(true) }]),
      cachesKeys: vi.fn().mockResolvedValue(["a", "b"]),
      cachesDelete: vi.fn().mockResolvedValue(true),
      sessionGet: vi.fn().mockReturnValue(null),
      sessionSet: vi.fn(),
      reload: vi.fn(),
      origin: "http://localhost:3000",
    };
    await runDevSwKill(deps);
    ```

  - Asserts the **four-cell truth table** (round-1 T1):
    1. `sessionGet → null` + 2 same-origin `/sw.js` regs → both `unregister()` called; both `cachesDelete` keys called; `sessionSet("kc:flag:v1:dev-sw-killed", "1")` called; `reload()` called once.
    2. `sessionGet → null` + 0 regs → no `unregister`, no `reload`, `sessionSet` NOT called (flag stays unset).
    3. `sessionGet → "1"` + 2 regs → `getRegistrations` NOT called (assert `deps.getRegistrations` mock has zero calls); no `unregister`, no `reload`.
    4. `sessionGet → "1"` + 0 regs → no `unregister`, no `reload`.
  - **Hostname allowlist truth table** (round-2 S10): for each of `localhost`, `127.0.0.1`, `127.0.0.5`, `::1`, `[::1]`, `koto.localhost` → kill runs; for `mac-mini.local`, `koto-city.example.com`, `192.168.0.5`, `0.0.0.0` → kill returns early (assert `getRegistrations` mock has zero calls).
  - Same test file: `shouldEmitDevSwKill("production") === false`, `"test" === false`, `"staging" === false`, `undefined === false`, `"" === false`, `"development" === true` (round-1 S1).
  - SSR-environment safety case for `cachedFetchJson` (round-1 T5 — separate file `lib/client-cache.test.ts`): two cases — (i) `// @vitest-environment node` block where `typeof window === "undefined"` → assert no throw, network result returned; (ii) jsdom env with `vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("QuotaExceededError"); })` → assert function returns network result without throwing.
  - **Layout-uses-script test** (round-1 T7; round-2 T10 corrected pattern): in `app/layout.test.tsx` (new), the test MUST manually await the async layout function and then call `renderToString` on the resolved JSX — `renderToString` does not handle async components directly. Pattern:

    ```ts
    vi.mock("next/headers", () => ({
      headers: async () => new Headers({ "x-nonce": "test-nonce" }),
    }));
    // Test:
    process.env.NODE_ENV = "development";
    const RootLayout = (await import("@/app/layout")).default;
    const element = await RootLayout({ children: <div data-testid="child" /> });
    const html = renderToString(element);
    expect(html).toContain(DEV_SW_KILL_SCRIPT);
    expect(html).toMatch(/nonce="test-nonce"/);
    ```

    For the production-mode case, repeat with `process.env.NODE_ENV = "production"` and assert `expect(html).not.toContain("kc:flag:v1:dev-sw-killed")`.
  - **Production-bundle exclusion test** (round-3 T14 — grep key updated to match round-2 namespace versioning): after `npm run build`, vitest integration test runs `grep -r "kc:flag:v1:dev-sw-killed" .next/static` and asserts ZERO matches. If `.next/static` does not exist when the test runs, SKIP with a `console.warn` — never silently passes.
  - **Wrapper smoke test** (round-3 T13): new file `lib/dev-sw-kill.smoke.test.ts` `eval`s the `DEV_SW_KILL_SCRIPT` string inside jsdom with all four browser globals (`navigator.serviceWorker`, `caches`, `sessionStorage`, `location`) stubbed at `globalThis`, AND asserts: (a) the literal substring `window.location.origin` appears in the wrapper source; (b) the literal substring `window.location.hostname` appears; (c) the literal substring `window.location.reload` appears. The smoke test is the ONLY surface that catches wrapper typos like `naivgator.serviceWorker` — `runDevSwKill` unit tests run on the helper alone and would not detect them.
- **Consumer-flow walkthrough**:
  - Consumer — browser running `npm run dev`. Reads inline `<script nonce>` from the SSR HTML. Operation: `eval` the body inline. The nonce is read by `app/layout.tsx` from `headers().get("x-nonce")` directly (round-1 S9 — NOT from `data-nonce` attribute, which is a pre-existing same-origin leak this plan does NOT propagate). The middleware-set per-request nonce is the source of truth.
  - Consumer — `lib/dev-sw-kill.test.ts`. Reads `DEV_SW_KILL_SCRIPT` as a string and `eval`s it inside a jsdom test environment with the stub setup above.
  - Consumer — `app/layout.test.tsx`. Reads the rendered HTML and asserts script presence/absence by NODE_ENV.

### C8 — Tighten `WeatherResponseSchema` ranges per Tokyo locale

(Round-1 S3 / S6 — newly added contract.)

- **Diff intent**: at [`lib/opendata/schemas/weather.ts`](lib/opendata/schemas/weather.ts), narrow numeric bounds so an upstream content compromise (or a malformed cached entry) cannot persist plausible-but-wrong forecast for the SW SWR window (1h) or the sessionStorage TTL window (5min).
- **Concrete bounds** (江東区 historical extremes per JMA + safety margin):
  - `temperature_2m_max`, `temperature_2m_min` ∈ `[-15, 45]` (°C). Tokyo's all-time absolute extremes are roughly -10 °C and 39 °C; a ±5 °C margin guards against legitimate climate drift while rejecting `-50` / `50` placeholders.
  - `precipitation_probability_max` ∈ `[0, 100]` (already bounded by the existing schema; verify).
  - `weathercode` ∈ existing WMO code allowlist (no change).
- **Invariants**:
  - Tightened ranges are applied to BOTH server-side parse (in `app/api/weather/route.ts:156`) AND client-side parse via `cachedFetchJson` (C4). A single shared schema is the source of truth — no per-callsite override.
  - A response that previously passed (e.g., a midsummer forecast) MUST continue to pass — the bounds are loose enough to never reject legitimate Tokyo weather.
  - **Shared schema scope** (round-2 F11): the existing `TemperatureSchema = z.number().min(-50).max(50)` constant in `lib/opendata/schemas/weather.ts` is shared by daily AND hourly paths (`temperature_2m_max`, `temperature_2m_min`, `temperature_2m`). C8 narrows the SHARED constant — tightening daily AND hourly together. The compatibility regression test below MUST replay BOTH daily and hourly fixtures.
  - **Adjacent fields** (round-2 S11/S13; round-3 F14): in the same diff, also verify `precipitation_probability_max` is `z.number().min(0).max(100).int()` (not `.nonnegative()` alone). Verify `weathercode` is constrained to a WMO allowlist `z.number().int().refine(v => WMO_CODES.has(v))`. **`WMO_CODES` source** (round-3 F14): if not already exported by `lib/opendata/schemas/weather.ts`, add `export const WMO_CODES = new Set<number>([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);` per the WMO 4677 codes documented at <https://open-meteo.com/en/docs>. Schema test asserts `weathercode: 7` rejected; `weathercode: 95` accepted. Also add a `time` array length cap (e.g., `.max(24 * 16)` for hourly, `.max(16)` for daily) to prevent JSON-size DoS via cached upstream response.
- **Forbidden patterns**:
  - pattern: `\.min\(-50\)` and `\.max\(50\)` in `lib/opendata/schemas/weather.ts` — reason: these are the loose bounds being tightened.
- **Acceptance**:
  - `lib/opendata/schemas/weather.test.ts` — extend with cases: `temperature_2m_max: -50` rejected, `temperature_2m_max: 49` rejected, `temperature_2m_max: 38` accepted. UPDATE existing case `"accepts temperature at boundary (-50 and 50)"` (round-2 T11) to assert the new boundary `[-15, 45]` instead.
  - **Compatibility regression**: replay the existing `lib/opendata/weather.client.test.ts` fixtures (real Open-Meteo response samples — both daily and hourly) through the tightened schema → all existing test responses still pass.
- **Consumer-flow walkthrough**:
  - Consumer 1 — `app/api/weather/route.ts` (Edge route). Tightened parse acts as defense-in-depth at the trust boundary.
  - Consumer 2 — `lib/client-cache.ts` `cachedFetchJson` (C4). Cached sessionStorage entries that fail the tightened parse are rejected and re-fetched.
  - Consumer 3 — SW StaleWhileRevalidate path. **Note**: the SW does NOT parse JSON (workbox just stores the raw response). The defense is at the consuming client's parse, which uses the tightened schema. So a Zod-rejected SW-cached body falls through to network fetch — the desired behaviour.

## Go/No-Go Gate

| ID   | Subject                                                | Status  |
|------|--------------------------------------------------------|---------|
| C0   | config/cache.ts centralised TTL constants              | locked  |
| C1   | jsonResponseHeaders per-route freshness option         | locked  |
| C1.1 | rateLimitResponse 429 → Cache-Control: no-store        | locked  |
| C2   | /api/weather emits browser-cacheable headers on 200    | locked  |
| C2.1 | MapClient POI URL canonicalisation (.toFixed(2))       | locked  |
| C3   | /api/pois emits browser-cacheable headers on 200       | locked  |
| C4   | lib/client-cache.ts sessionStorage TTL fetch helper    | locked  |
| C5   | SW runtimeCaching split (extracted to data module)     | locked  |
| C6   | predev installs dev SW killer at public/sw.js          | locked  |
| C7   | dev-only inline SW-kill bootstrap in layout            | locked  |
| C8   | Tighten WeatherResponseSchema ranges per Tokyo locale  | locked  |

## Testing strategy

### Unit (vitest)

- `lib/api-shared.test.ts` — extend with custom-cache-arg cases (default-arg unchanged; custom-arg emits the four directive tokens). Add the C1.1 `rateLimitResponse 429 → no-store` case. All cache-directive numeric values imported from `config/cache.ts` (round-1 T6).
- `lib/client-cache.test.ts` (new) — fresh hit / TTL expiry / safeParse mismatch / aborted request / **SSR (`@vitest-environment node` block — round-1 T5)** / **`setItem` throws (jsdom env — round-1 T5)**. All assertions on `WEATHER_CACHE.CLIENT_TTL_MS` interpolated from the constant.
- `lib/dev-sw-kill.test.ts` (new) — round-1 T1 four-cell truth table / `shouldEmitDevSwKill` six-case env table / explicit `caches` + `location.reload` + `navigator.serviceWorker` stub setup per round-1 T2/T3 / round-1 S7 same-origin `/sw.js` filter (assert that a foreign-`scriptURL` registration is NOT unregistered).
- `app/layout.test.tsx` (new — round-1 T7) — `renderToString` of layout with stubbed `headers()` → in `NODE_ENV=development` mode the rendered HTML contains the verbatim `DEV_SW_KILL_SCRIPT` substring; in `NODE_ENV=production` mode it does not.
- `app/api/weather/route.test.ts` — assert `max-age=${WEATHER_CACHE.BROWSER_MAX_AGE}` + `stale-while-revalidate=${WEATHER_CACHE.STALE_WHILE_REVALIDATE}` on 200; `no-store` on 429/502.
- `app/api/pois/route.test.ts` — assert per-route directive tokens on 200 (interpolated from `POIS_CACHE`); `no-store` on 400/429/502.
- `lib/sw-runtime-caching.test.ts` (new — round-1 T4 replacement) — anchored URL pattern matches `/api/weather`, `/api/weather?lang=ja` but NOT `/api/weatherings`; `/api/ics/.+` matches `/api/ics/events` but NOT `/api/ics`. Cache name is `weather-${buildId}` for the supplied buildId.
- `lib/opendata/schemas/weather.test.ts` — round-1 S3/C8 tightened-bounds cases.
- `app/map/MapClient.test.tsx` (new — round-1 F5 / round-2 F9) — URL canonicalisation regression: render MapClient and assert `fetch("/api/pois?...")` URLs are byte-identical for two viewport bboxes that round to the same `.toFixed(2)` snapped grid.
- **REMOVED**: the previously-listed "next.config.ts text-grep test" — round-1 T4 confirmed it gives false confidence (it asserts source text, not emitted SW). Replaced by `lib/sw-runtime-caching.test.ts` above.

### Manual (recorded in `docs/archive/review/perf-cache-and-dev-sw-cleanup-manual-test.md`)

Per R35 Tier-1 (Major) — this PR introduces a new long-running runtime artifact (the dev SW killer), so a manual test plan is required.

- Pre-conditions: prior `npm run build && npm run start` so prod SW is registered in browser.
- Step 1: stop server → `npm run dev` → soft reload → page MUST display the dev server's response (e.g., editing layout text immediately appears).
- Step 2: open DevTools Network → first `/api/weather` returns `200`, second visit within 5 minutes returns `(disk cache)` or `(memory cache)` with no network row.
- Step 3: navigate /home → /weather → /home → /weather (within 2 min); only the first /weather visit issues a network request.
- Step 4: 5 min + 1 s later, `/weather` visit issues a fresh network request.
- Step 5: stop dev server → `npm run build && npm run start` → reload → SW re-registers (next-pwa's), offline fallback (`/offline`) works on disconnect, push notifications still received via `components/PushOptIn.tsx`.
- Rollback: `git revert` the eleven contracts (C0 / C1 / C1.1 / C2 / C2.1 / C3 / C4 / C5 / C6 / C7 / C8). `public/sw.js` regenerates on next `npm run build`. No data migration. No external state to clean up.

### Adversarial scenarios (per R35 — Tier-1; round-1 T8 — each scenario now has reproducible steps)

#### Scenario A — Two-tab race

- Pre-conditions: `npm run build && npm run start` once to register prod SW. Stop server.
- Steps:
  1. Open Chrome with two tabs both on `http://localhost:3000/`.
  2. In tab 1: stop prod server, run `npm run dev`, soft-reload tab 1 (Cmd+R).
  3. Observe DevTools (Application > Service Workers) in tab 1 — should show "Source: sw.js" with "Status: activated and is running" then transition to "redundant" within 2 s.
  4. After tab 1 reloads automatically once, verify in tab 1 DevTools that "Service Workers" section shows ZERO registrations.
  5. Switch to tab 2 (do NOT manually reload). Click any nav link.
- Expected: tab 2 navigates to a fresh dev server response (not a cached prod response). Tab 2's DevTools shows zero SW registrations after the navigation. Neither tab enters a reload loop.

#### Scenario B — Foreign SW on shared localhost

- Pre-conditions: a different Next.js project running on `:3000` previously registered its own SW; that project is now stopped. The koto-city repo is the next project to run on `:3000`.
- Steps:
  1. In a fresh tab, navigate to `http://localhost:3000/` (foreign SW still registered in browser).
  2. Run `npm run dev` for koto-city. Soft-reload the tab.
- Expected: the kill script in C7 detects that the active SW's `scriptURL` ends in `/sw.js` AND is same-origin, so it WILL unregister it. (The foreign project also used `/sw.js`; same-origin means same `localhost:3000`, so this is by design — collateral damage is unavoidable for shared `localhost:3000`.) After 1 reload, no SW registered. Document this as a known dev-environment trade-off; recommend per-project port assignments for developers running multiple Next.js apps.

#### Scenario C — Hostile-CDN simulated cache directives

- Pre-conditions: dev server with a Workbox-driven SW from a prior `npm run build` registered. Use Chrome DevTools "Network conditions" to override response headers.
- Steps:
  1. After the killer SW completes (Scenario A finished), `npm run build && npm run start` to install the production SW.
  2. Visit `/weather` once to populate `weather-${buildId}` SW cache.
  3. Open DevTools > Network > right-click `/api/weather` row > "Override response headers" — strip `Cache-Control` and add `Cache-Control: must-revalidate, s-maxage=0`.
  4. Reload `/weather`.
- Expected: SW StaleWhileRevalidate path still returns the cached body (SW respects its own `cacheName` expiration, NOT the response's `Cache-Control` after caching). The page renders the cached response while a background fetch revalidates. Verify the rendered `DataFreshness` timestamp is not in the future and matches the original cache time.

#### Scenario D — Schema-tightening rejects historic-fixture content (round-1 S3/C8)

- Pre-conditions: `lib/opendata/weather.client.test.ts` fixtures are checked in.
- Steps:
  1. Run `npm test -- lib/opendata` and confirm all existing fixtures parse against the tightened ranges.
  2. Manually inject a fixture with `temperature_2m_max: 49` and run the same test.
- Expected: step 1 passes; step 2 fails with a Zod range error. Confirms the tightened bounds reject implausible values without breaking real Tokyo forecasts.

## Considerations & constraints

- The existing server-side KV cache (`/api/weather` 1h, `/api/pois` 1h) is preserved untouched. Track A adds layers IN FRONT of it; the route handler logic is unchanged except for the headers passed to `jsonResponseHeaders`.
- Risk: `StaleWhileRevalidate` for `/api/weather` could surface a 1-hour-stale response to the client when the user is offline. Mitigation: the existing `DataFreshness lastModified={fetchedAt}` UI ([`components/WeatherWidget.tsx:75`](components/WeatherWidget.tsx#L75)) gives the user a visible timestamp so they can interpret staleness. The `WeatherResponse` schema does not include a server-side `generatedAt`, so client-side `Date.now()` at fetch time is the authoritative freshness marker — acceptable.
- CSP: [`app/layout.tsx:46`](app/layout.tsx#L46) already exposes `nonce`. The new dev-only inline `<script nonce>` reuses it — no CSP rule change. **CSP report endpoint dependency** (round-1 S4): the endpoint `/api/csp-report` and the `report-to` directive in `lib/csp.ts` were added on commit `a3d750b` on `main` and are NOT present on every feature branch. **Pre-condition**: this PR is rebased atop `main` so `app/api/csp-report/route.ts` and `lib/csp.ts`'s `report-to default` + `Reporting-Endpoints` headers are present at implementation time. If the rebase produces conflicts that drop the endpoint, the plan's CSP-violation safety net is unverifiable and the implementation MUST stop and re-base correctly. Acceptance check at end of Phase 2: `find app/api/csp-report -name route.ts` returns one file; `grep -c "report-to" lib/csp.ts` returns ≥ 1.
- Security: NO new data exits the user's browser; sessionStorage entries are scoped per-tab. No new upstream calls. No new server endpoints.
- No breaking change to the public Response body shape of either route — only the header set changes.
- Out of scope: WBGT integration (separate branch `feature/wbgt-integration`), home personalization, ICS download caching, observability metrics for the new caches.
- **Adjacent follow-up filed (round-1 S9)**: removal of the `data-nonce` attribute from `<html>` in `app/layout.tsx:50` is a pre-existing security concern (per-request nonce should not be readable from any same-origin script). This plan does NOT introduce the leak and does NOT propagate it (C7 reads the nonce from `headers().get("x-nonce")` directly, NOT from `data-nonce`). Tracked as a separate hardening task: `TODO(security-data-nonce-removal): remove data-nonce HTML attribute and update any consumer that reads document.documentElement.dataset.nonce`.

### F10 (round-2) Minor — C1.1 forbidden-pattern brittleness — Accepted

- **Anti-Deferral check**: "out of scope (different feature)" — the forbidden pattern is decorative; the real guard is the route-level test "429 response carries Cache-Control: no-store" plus the `lib/api-shared.test.ts` rate-limit case.
- **Justification**: Worst case — a future handler builds the 429 response on a separate Headers variable referenced after the `status: 429` keyword; the regex misses it. Likelihood: low (no existing handler in the repo writes 429 responses outside `rateLimitResponse`). Cost to fix: ~30 LOC of regex experimentation OR refactor pattern to a static-analysis lint rule (~half-day). The route-level tests provide coverage even if the regex misses; deferring the regex tightening saves the half-day without leaving a coverage gap.
- **Orchestrator sign-off**: real guard is the test, not the regex. F10 deferral does not introduce a coverage gap because route-level tests assert the 429 Cache-Control on every protected route. TODO marker recorded above.

## User operation scenarios

1. **天気タブの再閲覧**: home → /weather → home → /weather (2分以内). 期待: 2回目の /weather でネットワークリクエスト発生せず、即座に画面描画。`DataFreshness` の取得日時は最初のフェッチ時刻のまま。
2. **マップ操作**: /map を開く → 50m 程度パン → 元のビューに戻る (1時間以内). 期待: 元 bbox はブラウザキャッシュにヒット。
3. **5分超過**: /weather を開いて閉じ、5分1秒後に再度開く. 期待: ネットワークリクエストが発生し、新しい `fetchedAt` で表示。
4. **開発再開シナリオ** (本タスクの主因): プロダクションビルドで SW 登録済みのブラウザで、`npm run dev` 起動後にページを開く. 期待: 1回目のロードで killer SW がインストール → activate で旧 SW を unregister + 全 cache を削除 → 制御下クライアントを `client.navigate(client.url)` でリロード → 2回目のロードは SW なしで dev サーバの最新出力を表示。手動ハードリロード不要。
5. **オフライン**: 過去24時間以内に /weather を閲覧したブラウザで機内モードに切り替え → /weather を開く. 期待: SW StaleWhileRevalidate により直近のレスポンスを表示 + バックグラウンド revalidation は失敗するが UI に影響なし。
6. **エラー応答**: /api/weather がアップストリーム障害で 502 を返す場合. 期待: ブラウザキャッシュは新しい 502 を保存しない (`Cache-Control: no-store`). 同セッション内で 5 分以内に再リクエストすると、サーバ側の KV stale-if-error で `X-Cache: STALE` が返り、200 として扱われる。
7. **2タブ並行**: 同じブラウザで /weather タブと /map タブを同時に開く. 期待: sessionStorage は per-tab なので相互干渉なし。両タブで独立に最初の1リクエストが発生する (許容)。
