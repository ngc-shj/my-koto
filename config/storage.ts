// LocalStorage key allowlist.
// IMPORTANT: Do not store PII (names, addresses, emails) or health information here.
// Only store non-sensitive user preferences and application state.
//
// `district_profiles_v1` is owned by `lib/profiles.ts` (multi-profile
// store). The legacy `district_id` key is migrated and removed on first
// load — we keep its reference here so /privacy disclosure stays accurate
// during the migration window.
import {
  clearAllProfiles,
  getActiveDistrictId,
  legacySetDistrictForActive,
} from "@/lib/profiles";

export const STORAGE_KEYS = {
  DISTRICT_PROFILES: "district_profiles_v1",
  // Legacy single-district key. New deployments will not see this; existing
  // localStorage entries are migrated by lib/profiles on read.
  DISTRICT_ID: "district_id",
  THEME: "theme",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export type ThemeValue = "light" | "dark" | null;

// --- district accessors (compatibility shim over lib/profiles) ---
//
// Existing callers expect a single string id. We bridge to the active
// profile so DistrictSelector / GomiPageClient / PushOptIn keep working
// without churn while the new profile-aware UIs adopt the richer API.

export function getDistrictId(): string | null {
  if (typeof window === "undefined") return null;
  return getActiveDistrictId();
}

export function setDistrictId(id: string): void {
  if (typeof window === "undefined") return;
  legacySetDistrictForActive(id);
}

export function clearDistrictId(): void {
  // Compatibility no-op kept for callers that previously cleared the
  // legacy key directly. Profile deletion goes through lib/profiles.
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEYS.DISTRICT_ID);
}

// --- theme accessors ---

export function getTheme(): ThemeValue {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEYS.THEME);
  if (value === "light" || value === "dark") return value;
  return null;
}

export function setTheme(theme: "light" | "dark"): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

// Clear every key this module owns, including the multi-profile store
// that lives behind lib/profiles.
export function clearAllStorage(): void {
  if (typeof window === "undefined") return;
  Object.values(STORAGE_KEYS).forEach((key) => {
    window.localStorage.removeItem(key);
  });
  clearAllProfiles();
}
