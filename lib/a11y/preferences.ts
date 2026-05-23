// Accessibility preferences persisted in LocalStorage.
//
// Currently a single boolean (`furigana_enabled`) but the file shape leaves
// room for future preferences (text size, high-contrast theme, etc.) without
// scattering more keys across config/storage.ts.

import { isBrowser } from "@/lib/ssr";

const FURIGANA_KEY = "a11y_furigana_v1";
// Same-tab update channel. Components that render district / category names
// listen for this so toggling the setting updates the screen without a
// reload. Cross-tab updates ride the standard `storage` event.
export const FURIGANA_CHANGE_EVENT = "koto-city:a11y-furigana-change";

export function getFuriganaEnabled(): boolean {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(FURIGANA_KEY) === "1";
}

export function setFuriganaEnabled(enabled: boolean): void {
  if (!isBrowser()) return;
  if (enabled) {
    window.localStorage.setItem(FURIGANA_KEY, "1");
  } else {
    window.localStorage.removeItem(FURIGANA_KEY);
  }
  // Dispatch even when the value didn't change — UIs treat the event as
  // a "re-read storage" signal, not a delta.
  window.dispatchEvent(
    new CustomEvent(FURIGANA_CHANGE_EVENT, { detail: enabled }),
  );
}

export function subscribeFuriganaChange(
  callback: (enabled: boolean) => void,
): () => void {
  if (!isBrowser()) return () => undefined;
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<boolean>).detail;
    if (typeof detail === "boolean") callback(detail);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === FURIGANA_KEY) callback(event.newValue === "1");
  };
  window.addEventListener(FURIGANA_CHANGE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(FURIGANA_CHANGE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function clearFuriganaPreference(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(FURIGANA_KEY);
  window.dispatchEvent(
    new CustomEvent(FURIGANA_CHANGE_EVENT, { detail: false }),
  );
}
