import { expect } from "vitest";
import { toHaveNoViolations } from "vitest-axe/matchers";

expect.extend({ toHaveNoViolations });

// Node 25 ships a built-in `globalThis.localStorage` that is an empty
// object with no Storage API methods. It shadows jsdom's `window.localStorage`
// proxy and breaks every test that touches storage. We install a minimal
// Map-backed Storage double on both globals so tests see a consistent API
// regardless of which property happens to be queried.
{
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
  }
}
