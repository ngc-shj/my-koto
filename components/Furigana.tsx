"use client";

import {
  cloneElement,
  Fragment,
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import districts from "@/data/districts.json";
import {
  getFuriganaEnabled,
  subscribeFuriganaChange,
} from "@/lib/a11y/preferences";
import { lookupReading, tokenize } from "@/lib/a11y/readings";

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

// Recursively walk a React subtree and rewrite plain-text leaves into
// ruby tokens. Use this around static prose pages (privacy, about,
// disclaimer) so a single wrapper covers the whole document instead of
// sprinkling <KanjiText> at every label.
//
// Caveats:
// - Stops at component boundaries — children rendered by descendant
//   components are not re-walked, since their props.children at this layer
//   represent the source text only.
// - cloneElement is used to preserve element type/props; refs are not
//   forwarded, but no static prose currently relies on refs into wrapped
//   text.
export function KanjiAuto({ children }: { children: ReactNode }) {
  const enabled = useFuriganaEnabled();
  if (!enabled) return <>{children}</>;
  return <>{walkForRuby(children)}</>;
}

function walkForRuby(node: ReactNode): ReactNode {
  if (typeof node === "string") return tokenizeToRuby(node);
  if (
    node == null ||
    typeof node === "number" ||
    typeof node === "boolean"
  ) {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((child, idx) => (
      <Fragment key={idx}>{walkForRuby(child)}</Fragment>
    ));
  }
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    const childChildren = element.props.children;
    if (childChildren == null) return element;
    return cloneElement(element, undefined, walkForRuby(childChildren));
  }
  return node;
}

function tokenizeToRuby(text: string): ReactNode {
  const tokens = tokenize(text);
  if (tokens.every((t) => t.reading == null)) return text;
  return (
    <>
      {tokens.map((token, index) => {
        if (token.reading) {
          return (
            <ruby key={index}>
              {token.text}
              <rt>{token.reading}</rt>
            </ruby>
          );
        }
        return <Fragment key={index}>{token.text}</Fragment>;
      })}
    </>
  );
}

// Auto-lookup wrapper for any rendered Japanese label.
//
// Tokenises the input by longest-match against `KANJI_READINGS` so a
// compound string like "今日のごみは燃やすごみ" produces ruby for both
// "今日" and "燃やすごみ" with the connecting kana rendered plain. Drop
// this in for any visible label / heading / inline text — already-kana
// strings or unknown kanji pass through unchanged.
export function KanjiText({ text }: { text: string }) {
  const enabled = useFuriganaEnabled();
  if (!enabled) return <>{text}</>;
  // Exact-match short-circuit for the common case (a single dictionary
  // entry — e.g. "燃やすごみ"). Avoids the per-character scan.
  const exactReading = lookupReading(text);
  if (exactReading != null) {
    return (
      <ruby>
        {text}
        <rt>{exactReading}</rt>
      </ruby>
    );
  }
  const tokens = tokenize(text);
  // No matches at all: render plain text — saves a wrapping fragment plus
  // the implicit React.Children traversal.
  if (tokens.every((t) => t.reading == null)) {
    return <>{text}</>;
  }
  return (
    <>
      {tokens.map((token, index) => {
        if (token.reading) {
          return (
            <ruby key={index}>
              {token.text}
              <rt>{token.reading}</rt>
            </ruby>
          );
        }
        return <Fragment key={index}>{token.text}</Fragment>;
      })}
    </>
  );
}
