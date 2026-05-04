import { describe, expect, it, beforeEach } from "vitest";
import {
  createProfile,
  deleteProfile,
  getActiveProfile,
  getActiveDistrictId,
  getProfiles,
  legacySetDistrictForActive,
  PROFILE_LIMITS,
  renameProfile,
  setActiveProfile,
  setProfileDistrict,
  clearAllProfiles,
} from "./profiles";

// The Storage double is installed globally in vitest.setup.ts to work
// around a Node 25 + jsdom interaction that breaks `window.localStorage`.
beforeEach(() => {
  window.localStorage.clear();
});

describe("getProfiles / getActiveProfile (empty state)", () => {
  it("returns no profiles when localStorage is fresh", () => {
    expect(getProfiles()).toEqual([]);
    expect(getActiveProfile()).toBeNull();
    expect(getActiveDistrictId()).toBeNull();
  });
});

describe("legacy migration", () => {
  it("promotes a legacy district_id to a profile named メイン", () => {
    window.localStorage.setItem("district_id", "kameido-1-3");
    const profiles = getProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe("メイン");
    expect(profiles[0].districtId).toBe("kameido-1-3");
    expect(getActiveDistrictId()).toBe("kameido-1-3");
    // Legacy key is cleared so it never participates in subsequent reads.
    expect(window.localStorage.getItem("district_id")).toBeNull();
  });

  it("is idempotent: a second read does not duplicate the migrated profile", () => {
    window.localStorage.setItem("district_id", "toyosu");
    const first = getProfiles();
    const second = getProfiles();
    expect(first).toEqual(second);
    expect(second).toHaveLength(1);
  });
});

describe("createProfile", () => {
  it("appends a profile and auto-activates the first one", () => {
    const result = createProfile({ name: "家", districtId: "toyosu" });
    expect(result.ok).toBe(true);
    expect(getActiveProfile()?.name).toBe("家");
  });

  it("does not flip the active profile when adding subsequent ones", () => {
    createProfile({ name: "家", districtId: "toyosu" });
    createProfile({ name: "職場", districtId: "kiba" });
    expect(getActiveProfile()?.name).toBe("家");
  });

  it("rejects empty / whitespace-only names", () => {
    const r = createProfile({ name: "  ", districtId: "toyosu" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("name-empty");
  });

  it("rejects names exceeding the length cap", () => {
    const longName = "あ".repeat(PROFILE_LIMITS.maxNameLength + 1);
    const r = createProfile({ name: longName, districtId: "toyosu" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("name-too-long");
  });

  it("rejects duplicate names case-insensitively", () => {
    createProfile({ name: "Home", districtId: "toyosu" });
    const r = createProfile({ name: "home", districtId: "kiba" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("duplicate-name");
  });

  it("enforces the profile limit", () => {
    for (let i = 0; i < PROFILE_LIMITS.maxProfiles; i += 1) {
      createProfile({ name: `p${i}`, districtId: "toyosu" });
    }
    const r = createProfile({ name: "overflow", districtId: "toyosu" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("limit-reached");
  });
});

describe("renameProfile", () => {
  it("renames an existing profile", () => {
    const created = createProfile({ name: "家", districtId: "toyosu" });
    if (!created.ok) throw new Error("setup");
    const r = renameProfile(created.profile.id, "実家");
    expect(r.ok).toBe(true);
    expect(getActiveProfile()?.name).toBe("実家");
  });

  it("rejects renaming to an existing name (other profile)", () => {
    createProfile({ name: "家", districtId: "toyosu" });
    const second = createProfile({ name: "職場", districtId: "kiba" });
    if (!second.ok) throw new Error("setup");
    const r = renameProfile(second.profile.id, "家");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("duplicate-name");
  });

  it("allows renaming to the same name (no-op)", () => {
    const created = createProfile({ name: "家", districtId: "toyosu" });
    if (!created.ok) throw new Error("setup");
    const r = renameProfile(created.profile.id, "家");
    expect(r.ok).toBe(true);
  });

  it("returns not-found for unknown ids", () => {
    const r = renameProfile("p_missing", "X");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not-found");
  });
});

describe("setProfileDistrict", () => {
  it("updates the district of an existing profile", () => {
    const created = createProfile({ name: "家", districtId: "toyosu" });
    if (!created.ok) throw new Error("setup");
    setProfileDistrict(created.profile.id, "kiba");
    expect(getActiveDistrictId()).toBe("kiba");
  });
});

describe("setActiveProfile", () => {
  it("switches which profile is active", () => {
    const a = createProfile({ name: "家", districtId: "toyosu" });
    const b = createProfile({ name: "職場", districtId: "kiba" });
    if (!a.ok || !b.ok) throw new Error("setup");
    setActiveProfile(b.profile.id);
    expect(getActiveDistrictId()).toBe("kiba");
  });

  it("rejects unknown ids without changing active", () => {
    const a = createProfile({ name: "家", districtId: "toyosu" });
    if (!a.ok) throw new Error("setup");
    const r = setActiveProfile("p_missing");
    expect(r.ok).toBe(false);
    expect(getActiveDistrictId()).toBe("toyosu");
  });
});

describe("deleteProfile", () => {
  it("removes a profile and reassigns active when needed", () => {
    const a = createProfile({ name: "家", districtId: "toyosu" });
    const b = createProfile({ name: "職場", districtId: "kiba" });
    if (!a.ok || !b.ok) throw new Error("setup");
    // Active was the first one; deleting it should fall back to the next.
    deleteProfile(a.profile.id);
    expect(getActiveProfile()?.name).toBe("職場");
  });

  it("clears active when the last profile is deleted", () => {
    const a = createProfile({ name: "家", districtId: "toyosu" });
    if (!a.ok) throw new Error("setup");
    deleteProfile(a.profile.id);
    expect(getActiveProfile()).toBeNull();
    expect(getActiveDistrictId()).toBeNull();
  });

  it("does not change active when deleting a non-active profile", () => {
    const a = createProfile({ name: "家", districtId: "toyosu" });
    const b = createProfile({ name: "職場", districtId: "kiba" });
    if (!a.ok || !b.ok) throw new Error("setup");
    deleteProfile(b.profile.id);
    expect(getActiveProfile()?.name).toBe("家");
  });
});

describe("legacySetDistrictForActive", () => {
  it("creates a default profile when none exists", () => {
    legacySetDistrictForActive("toyosu");
    const p = getActiveProfile();
    expect(p?.name).toBe("メイン");
    expect(p?.districtId).toBe("toyosu");
  });

  it("updates the active profile when one already exists", () => {
    const created = createProfile({ name: "家", districtId: "toyosu" });
    if (!created.ok) throw new Error("setup");
    legacySetDistrictForActive("kiba");
    // Same profile, different district.
    expect(getActiveProfile()?.name).toBe("家");
    expect(getActiveDistrictId()).toBe("kiba");
  });
});

describe("clearAllProfiles", () => {
  it("removes the storage envelope so subsequent reads are empty", () => {
    createProfile({ name: "家", districtId: "toyosu" });
    clearAllProfiles();
    expect(getProfiles()).toEqual([]);
    expect(getActiveProfile()).toBeNull();
  });
});
