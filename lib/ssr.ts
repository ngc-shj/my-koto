// SSR-safe environment predicates. Server Components and pure modules
// import these instead of inlining the `typeof window` check, so a
// future drift (e.g. adding `globalThis` polyfills, expanding the
// hasIndexedDB heuristic) only needs one edit.

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function hasIndexedDB(): boolean {
  return isBrowser() && typeof window.indexedDB !== "undefined";
}
