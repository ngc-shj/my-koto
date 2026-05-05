export type DevSwKillDeps = {
  readonly getHostname: () => string;
  readonly getRegistrations: () => Promise<readonly ServiceWorkerRegistration[]>;
  readonly cachesKeys: () => Promise<readonly string[]>;
  readonly cachesDelete: (key: string) => Promise<boolean>;
  readonly sessionGet: (key: string) => string | null;
  readonly sessionSet: (key: string, value: string) => void;
  readonly reload: () => void;
  readonly origin: string;
};

const SESSION_FLAG = "kc:flag:v1:dev-sw-killed";

// Loopback hostname allowlist — belt-and-suspenders for the dev-only kill script
function isAllowedHostname(h: string): boolean {
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]") {
    return true;
  }
  if (/^127\./.test(h)) return true;
  if (h.endsWith(".localhost")) return true;
  return false;
}

export async function runDevSwKill(deps: DevSwKillDeps): Promise<void> {
  // Step 1: Only run on known loopback hostnames
  if (!isAllowedHostname(deps.getHostname())) return;

  // Step 2: Idempotency — short-circuit if already killed this session
  if (deps.sessionGet(SESSION_FLAG) === "1") return;

  // Step 3: Get registered service workers
  const regs = await deps.getRegistrations();

  // Step 4: Filter to same-origin /sw.js registrations only
  const targets = regs.filter(
    (r) =>
      r.active?.scriptURL.endsWith("/sw.js") &&
      new URL(r.active.scriptURL).origin === deps.origin
  );

  // Step 5: Unregister matching SWs
  await Promise.all(targets.map((r) => r.unregister()));

  // Step 6: Delete all caches
  const keys = await deps.cachesKeys();
  await Promise.all(keys.map((k) => deps.cachesDelete(k)));

  // Step 7: Set flag and reload only if we found and unregistered something
  if (targets.length > 0) {
    deps.sessionSet(SESSION_FLAG, "1");
    deps.reload();
  }
}

// Returns true only for development — positive match per plan C7/S1
export function shouldEmitDevSwKill(env: string | undefined): boolean {
  return env === "development";
}

// Inline script emitted into <head> in dev mode.
// Constructs DevSwKillDeps from real browser globals and calls runDevSwKill.
// IIFE-wrapped so it executes immediately.
export const DEV_SW_KILL_SCRIPT: string = `
(async () => {
  if (!("serviceWorker" in navigator)) return;
  const SESSION_FLAG = "kc:flag:v1:dev-sw-killed";
  function isAllowedHostname(h) {
    if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]") return true;
    if (/^127\\./.test(h)) return true;
    if (h.endsWith(".localhost")) return true;
    return false;
  }
  const deps = {
    getHostname: () => window.location.hostname,
    getRegistrations: () => navigator.serviceWorker.getRegistrations(),
    cachesKeys: () => caches.keys(),
    cachesDelete: (k) => caches.delete(k),
    sessionGet: (key) => sessionStorage.getItem(key),
    sessionSet: (key, value) => sessionStorage.setItem(key, value),
    reload: () => window.location.reload(),
    origin: window.location.origin,
  };
  if (!isAllowedHostname(deps.getHostname())) return;
  if (deps.sessionGet(SESSION_FLAG) === "1") return;
  const regs = await deps.getRegistrations();
  const targets = regs.filter(
    (r) => r.active && r.active.scriptURL.endsWith("/sw.js") &&
      new URL(r.active.scriptURL).origin === deps.origin
  );
  await Promise.all(targets.map((r) => r.unregister()));
  const keys = await deps.cachesKeys();
  await Promise.all(keys.map((k) => deps.cachesDelete(k)));
  if (targets.length > 0) {
    deps.sessionSet(SESSION_FLAG, "1");
    deps.reload();
  }
})();
`.trim();
