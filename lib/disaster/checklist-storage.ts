// Persists which emergency-checklist items the visitor has ticked, so the
// list survives reloads (the point of a checklist is to track progress over
// repeated visits). Only opaque item ids are stored — no personal data.
//
// SSR-safe: accessors early-return when window is undefined.

import { isBrowser } from "@/lib/ssr";

const STORAGE_KEY = "disaster_checklist_v1";

export function loadCheckedItems(): ReadonlySet<string> {
  if (!isBrowser()) return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

export function saveCheckedItems(ids: ReadonlySet<string>): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Quota / privacy mode — checklist simply won't persist this session.
  }
}
