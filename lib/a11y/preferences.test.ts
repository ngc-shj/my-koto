import { describe, expect, it, beforeEach } from "vitest";
import {
  clearFuriganaPreference,
  FURIGANA_CHANGE_EVENT,
  getFuriganaEnabled,
  setFuriganaEnabled,
  subscribeFuriganaChange,
} from "./preferences";

beforeEach(() => {
  // The Storage double in vitest.setup.ts is shared across tests; clear
  // only the keys this module owns.
  window.localStorage.removeItem("a11y_furigana_v1");
});

describe("getFuriganaEnabled / setFuriganaEnabled", () => {
  it("defaults to false on a fresh device", () => {
    expect(getFuriganaEnabled()).toBe(false);
  });

  it("round-trips a true→false→true sequence", () => {
    setFuriganaEnabled(true);
    expect(getFuriganaEnabled()).toBe(true);
    setFuriganaEnabled(false);
    expect(getFuriganaEnabled()).toBe(false);
    setFuriganaEnabled(true);
    expect(getFuriganaEnabled()).toBe(true);
  });

  it("removes the key when setting false (no orphan storage entry)", () => {
    setFuriganaEnabled(true);
    setFuriganaEnabled(false);
    expect(window.localStorage.getItem("a11y_furigana_v1")).toBeNull();
  });
});

describe("subscribeFuriganaChange", () => {
  it("notifies subscribers on same-tab updates", async () => {
    let observed: boolean | null = null;
    const unsubscribe = subscribeFuriganaChange((next) => {
      observed = next;
    });
    setFuriganaEnabled(true);
    // Custom events are dispatched synchronously, so the observer should
    // already have the new value.
    expect(observed).toBe(true);
    setFuriganaEnabled(false);
    expect(observed).toBe(false);
    unsubscribe();
  });

  it("ignores unrelated storage events", () => {
    const observed: boolean[] = [];
    const unsubscribe = subscribeFuriganaChange((next) => {
      observed.push(next);
    });
    // Simulate a storage event from another key — the subscription must
    // not fire for that.
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "unrelated_key",
        newValue: "1",
      }),
    );
    expect(observed).toEqual([]);
    unsubscribe();
  });

  it("returns an unsubscribe function that disconnects the listener", () => {
    let observed: boolean | null = null;
    const unsubscribe = subscribeFuriganaChange((next) => {
      observed = next;
    });
    unsubscribe();
    setFuriganaEnabled(true);
    expect(observed).toBeNull();
  });

  it("dispatches a re-read signal even when the value did not change", () => {
    setFuriganaEnabled(true);
    let calls = 0;
    const unsubscribe = subscribeFuriganaChange(() => {
      calls += 1;
    });
    // Setting the same value should still fire the event so listeners can
    // treat the event as "re-read storage" rather than a delta.
    setFuriganaEnabled(true);
    expect(calls).toBe(1);
    unsubscribe();
  });
});

describe("clearFuriganaPreference", () => {
  it("removes the key and notifies subscribers it is now off", () => {
    setFuriganaEnabled(true);
    let observed: boolean | null = null;
    const unsubscribe = subscribeFuriganaChange((next) => {
      observed = next;
    });
    clearFuriganaPreference();
    expect(getFuriganaEnabled()).toBe(false);
    expect(observed).toBe(false);
    unsubscribe();
  });
});

describe("FURIGANA_CHANGE_EVENT", () => {
  it("uses a recognisable, namespaced event name to avoid collisions", () => {
    // Sanity check — guarantees future grep-ability when tracing UI re-render
    // behaviour back to a setFuriganaEnabled call site.
    expect(FURIGANA_CHANGE_EVENT).toContain("koto-city");
  });
});
