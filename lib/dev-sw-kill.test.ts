import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runDevSwKill,
  shouldEmitDevSwKill,
  DEV_SW_KILL_SCRIPT,
} from "./dev-sw-kill";
import type { DevSwKillDeps } from "./dev-sw-kill";

// Helper to build a default set of mocks
function makeDeps(
  overrides: Partial<{
    hostname: string;
    sessionFlagValue: string | null;
    registrations: Partial<ServiceWorkerRegistration>[];
    cacheKeys: string[];
  }> = {}
): DevSwKillDeps & {
  getRegistrations: ReturnType<typeof vi.fn>;
  cachesKeys: ReturnType<typeof vi.fn>;
  cachesDelete: ReturnType<typeof vi.fn>;
  sessionGet: ReturnType<typeof vi.fn>;
  sessionSet: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
} {
  const {
    hostname = "localhost",
    sessionFlagValue = null,
    registrations = [],
    cacheKeys = [],
  } = overrides;

  const mockRegs = registrations.map((r) => ({
    active: r.active ?? null,
    unregister: vi.fn().mockResolvedValue(true),
    ...r,
  }));

  return {
    getHostname: () => hostname,
    getRegistrations: vi.fn().mockResolvedValue(mockRegs),
    cachesKeys: vi.fn().mockResolvedValue(cacheKeys),
    cachesDelete: vi.fn().mockResolvedValue(true),
    sessionGet: vi.fn().mockReturnValue(sessionFlagValue),
    sessionSet: vi.fn(),
    reload: vi.fn(),
    origin: "http://localhost:3000",
  };
}

function makeReg(scriptURL = "http://localhost:3000/sw.js") {
  return {
    active: { scriptURL } as ServiceWorker,
  } as Partial<ServiceWorkerRegistration>;
}

describe("runDevSwKill — four-cell truth table", () => {
  it("case 1: flag unset + 2 same-origin /sw.js regs → unregisters, clears caches, sets flag, reloads", async () => {
    const deps = makeDeps({
      sessionFlagValue: null,
      registrations: [makeReg(), makeReg()],
      cacheKeys: ["a", "b"],
    });

    await runDevSwKill(deps);

    expect(deps.getRegistrations).toHaveBeenCalledTimes(1);
    // Both registrations' unregister() should have been called
    const regs = await deps.getRegistrations.mock.results[0].value;
    for (const r of regs) {
      expect(r.unregister).toHaveBeenCalledTimes(1);
    }
    expect(deps.cachesDelete).toHaveBeenCalledWith("a");
    expect(deps.cachesDelete).toHaveBeenCalledWith("b");
    // Phase 3 F1: cache wipe must run BEFORE any SW unregister (mirrors the
    // killer SW order in scripts/dev-sw-killer.js so the two cleanup
    // mechanisms stay in lockstep).
    const cachesKeysOrder = deps.cachesKeys.mock.invocationCallOrder[0];
    const firstUnregisterOrder = regs[0].unregister.mock.invocationCallOrder[0];
    expect(cachesKeysOrder).toBeLessThan(firstUnregisterOrder);
    expect(deps.sessionSet).toHaveBeenCalledWith("kc:flag:v1:dev-sw-killed", "1");
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("case 2: flag unset + 0 regs → no unregister, no reload, sessionSet NOT called", async () => {
    const deps = makeDeps({ sessionFlagValue: null, registrations: [] });

    await runDevSwKill(deps);

    expect(deps.getRegistrations).toHaveBeenCalledTimes(1);
    // Cache wipe still fires by design — clears stale entries even when no SW
    // matched, since the SW may have been unregistered manually leaving caches
    // behind. (Self-R-check round-1 M1.)
    expect(deps.cachesKeys).toHaveBeenCalledTimes(1);
    // Phase 3 T1: with no cache keys returned, cachesDelete must not run.
    expect(deps.cachesDelete).toHaveBeenCalledTimes(0);
    expect(deps.sessionSet).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it("case 3: flag set → getRegistrations NOT called", async () => {
    const deps = makeDeps({
      sessionFlagValue: "1",
      registrations: [makeReg(), makeReg()],
    });

    await runDevSwKill(deps);

    expect(deps.getRegistrations).toHaveBeenCalledTimes(0);
    // Phase 3 T2: short-circuit must happen BEFORE any I/O — including the
    // cache wipe — so a regression that moved the flag check after cachesKeys
    // is caught here.
    expect(deps.cachesKeys).not.toHaveBeenCalled();
    expect(deps.cachesDelete).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it("case 4: flag set + 0 regs → no unregister, no reload", async () => {
    const deps = makeDeps({ sessionFlagValue: "1", registrations: [] });

    await runDevSwKill(deps);

    expect(deps.getRegistrations).toHaveBeenCalledTimes(0);
    // Phase 3 T2: same short-circuit guarantee as case 3.
    expect(deps.cachesKeys).not.toHaveBeenCalled();
    expect(deps.cachesDelete).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });
});

describe("runDevSwKill — hostname allowlist", () => {
  const allowedHostnames = [
    "localhost",
    "127.0.0.1",
    "127.0.0.5",
    "::1",
    "[::1]",
    "koto.localhost",
  ];

  const blockedHostnames = [
    "mac-mini.local",
    "my-koto.example.com",
    "192.168.0.5",
    "0.0.0.0",
  ];

  for (const hostname of allowedHostnames) {
    it(`allows ${hostname}`, async () => {
      const deps = makeDeps({ hostname, sessionFlagValue: null, registrations: [] });
      await runDevSwKill(deps);
      // getRegistrations is called (hostname was not blocked)
      expect(deps.getRegistrations).toHaveBeenCalledTimes(1);
    });
  }

  for (const hostname of blockedHostnames) {
    it(`blocks ${hostname} — getRegistrations not called`, async () => {
      const deps = makeDeps({
        hostname,
        sessionFlagValue: null,
        registrations: [makeReg()],
      });
      await runDevSwKill(deps);
      expect(deps.getRegistrations).toHaveBeenCalledTimes(0);
    });
  }
});

describe("runDevSwKill — same-origin filter", () => {
  it("does not unregister a registration whose scriptURL is on a different origin", async () => {
    const crossOriginReg = makeReg("https://other.example.com/sw.js");
    const deps = makeDeps({
      sessionFlagValue: null,
      registrations: [crossOriginReg],
    });

    await runDevSwKill(deps);

    const regs = await deps.getRegistrations.mock.results[0].value;
    expect(regs[0].unregister).not.toHaveBeenCalled();
    // No targets → no reload, no flag set
    expect(deps.reload).not.toHaveBeenCalled();
    expect(deps.sessionSet).not.toHaveBeenCalled();
  });
});

describe("shouldEmitDevSwKill", () => {
  it('returns true for "development"', () => {
    expect(shouldEmitDevSwKill("development")).toBe(true);
  });

  it('returns false for "production"', () => {
    expect(shouldEmitDevSwKill("production")).toBe(false);
  });

  it('returns false for "test"', () => {
    expect(shouldEmitDevSwKill("test")).toBe(false);
  });

  it('returns false for "staging"', () => {
    expect(shouldEmitDevSwKill("staging")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(shouldEmitDevSwKill(undefined)).toBe(false);
  });

  it('returns false for ""', () => {
    expect(shouldEmitDevSwKill("")).toBe(false);
  });
});

describe("DEV_SW_KILL_SCRIPT string", () => {
  it("contains kc:flag:v1:dev-sw-killed", () => {
    expect(DEV_SW_KILL_SCRIPT).toContain("kc:flag:v1:dev-sw-killed");
  });
});
