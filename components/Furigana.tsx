"use client";

import { useEffect, useState } from "react";
import districts from "@/data/districts.json";
import {
  getFuriganaEnabled,
  subscribeFuriganaChange,
} from "@/lib/a11y/preferences";

// React hook: returns the current furigana preference and re-renders when
// the user toggles it (same tab via custom event, other tabs via storage).
// SSR-safe: returns false on the server so the first paint is identical
// regardless of whatever the browser will read once hydrated.
export function useFuriganaEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(getFuriganaEnabled());
    return subscribeFuriganaChange(setEnabled);
  }, []);
  return enabled;
}

export type FuriganaProps = {
  // The kanji-bearing text to render.
  text: string;
  // The yomigana for the text. When omitted (or equal to `text`), the
  // component falls back to plain text — a missing reading is not a bug,
  // it simply means no furigana to display.
  reading?: string;
};

export function Furigana({ text, reading }: FuriganaProps) {
  const enabled = useFuriganaEnabled();
  if (!enabled || !reading || reading === text) {
    return <>{text}</>;
  }
  return (
    <ruby>
      {text}
      <rt>{reading}</rt>
    </ruby>
  );
}

// Lookup table built once at module load — the districts.json bundle is
// stable across the app's lifetime so any per-render overhead would be
// strictly waste.
const DISTRICT_BY_ID = new Map<
  string,
  { label: string; reading?: string }
>(
  (
    districts as Array<{ id: string; label: string; reading?: string }>
  ).map((d) => [d.id, { label: d.label, reading: d.reading }]),
);

// Convenience wrapper: looks the district up by id and renders its label
// (with optional ruby reading) so callers don't have to import the master
// list themselves.
export function DistrictName({ id }: { id: string }) {
  const entry = DISTRICT_BY_ID.get(id);
  if (!entry) return <>{id}</>;
  return <Furigana text={entry.label} reading={entry.reading} />;
}
