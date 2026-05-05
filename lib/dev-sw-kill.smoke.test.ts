/**
 * @vitest-environment jsdom
 *
 * Smoke test for DEV_SW_KILL_SCRIPT:
 * - Verifies required literal substrings are present in the wrapper source
 * - Evals the script inside jsdom with stubbed browser globals to catch typos
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEV_SW_KILL_SCRIPT } from "./dev-sw-kill";

describe("DEV_SW_KILL_SCRIPT wrapper source substrings", () => {
  it("contains window.location.origin", () => {
    expect(DEV_SW_KILL_SCRIPT).toContain("window.location.origin");
  });

  it("contains window.location.hostname", () => {
    expect(DEV_SW_KILL_SCRIPT).toContain("window.location.hostname");
  });

  it("contains window.location.reload", () => {
    expect(DEV_SW_KILL_SCRIPT).toContain("window.location.reload");
  });
});

describe("DEV_SW_KILL_SCRIPT eval smoke test", () => {
  beforeEach(() => {
    // Stub navigator.serviceWorker
    Object.defineProperty(globalThis, "navigator", {
      value: {
        serviceWorker: {
          getRegistrations: vi.fn().mockResolvedValue([]),
        },
      },
      writable: true,
      configurable: true,
    });

    // Stub caches
    Object.defineProperty(globalThis, "caches", {
      value: {
        keys: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
      },
      writable: true,
      configurable: true,
    });

    // Stub sessionStorage
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: vi.fn((k: string) => store[k] ?? null),
        setItem: vi.fn((k: string, v: string) => {
          store[k] = v;
        }),
      },
      writable: true,
      configurable: true,
    });

    // Stub window.location (jsdom already sets this, but ensure reload and hostname are available)
    Object.defineProperty(globalThis.window, "location", {
      value: {
        hostname: "localhost",
        origin: "http://localhost:3000",
        reload: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  it("evals without throwing", async () => {
    // Use indirect eval to avoid strict-mode issues
    // eslint-disable-next-line no-new-func
    const fn = new Function(DEV_SW_KILL_SCRIPT);
    // Should not throw synchronously; any async work runs in the background
    expect(() => fn()).not.toThrow();
  });
});
