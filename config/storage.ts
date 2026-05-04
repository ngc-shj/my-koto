// LocalStorage key allowlist.
// IMPORTANT: Do not store PII (names, addresses, emails) or health information here.
// Only store non-sensitive user preferences and application state.
export const STORAGE_KEYS = {
  DISTRICT_ID: "district_id",
  THEME: "theme",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export type ThemeValue = "light" | "dark" | null;

// --- district_id accessors ---

export function getDistrictId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEYS.DISTRICT_ID);
}

export function setDistrictId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS.DISTRICT_ID, id);
}

export function clearDistrictId(): void {
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

// Clear all application LocalStorage keys.
export function clearAllStorage(): void {
  if (typeof window === "undefined") return;
  Object.values(STORAGE_KEYS).forEach((key) => {
    window.localStorage.removeItem(key);
  });
}
