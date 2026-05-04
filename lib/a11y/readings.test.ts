import { describe, expect, it } from "vitest";
import { KANJI_READINGS, lookupReading } from "./readings";
import { GOMI_CATEGORY_LABELS } from "@/lib/gomi/types";
import { HAZARD_LABELS, type HazardKind } from "@/lib/map/types";
import { LAYERS } from "@/lib/map/registry";

describe("lookupReading", () => {
  it("returns hiragana for known entries", () => {
    expect(lookupReading("燃やすごみ")).toBe("もやすごみ");
    expect(lookupReading("避難場所")).toBe("ひなんばしょ");
    expect(lookupReading("洪水")).toBe("こうずい");
  });

  it("returns undefined for unknown entries", () => {
    expect(lookupReading("AED")).toBeUndefined();
    expect(lookupReading("ペットボトル")).toBeUndefined();
    expect(lookupReading("")).toBeUndefined();
  });

  it("readings never contain kanji or katakana (would defeat furigana)", () => {
    // Hiragana ranges (0x3041–0x309F) plus latin letters / digits and
    // common punctuation (・, /, parens, slash, spaces). The point is to
    // catch the regression of typing katakana or kanji into a reading by
    // accident — not to require pure hiragana, since some compound entries
    // legitimately mix Latin acronyms (e.g. "WBGT (あつさしすう…)").
    const FORBIDDEN = /[一-鿿ヴァ-ヺ]/; // CJK ideographs + katakana
    for (const [key, reading] of Object.entries(KANJI_READINGS)) {
      expect(
        FORBIDDEN.test(reading),
        `reading for "${key}" contains kanji or katakana: "${reading}"`,
      ).toBe(false);
    }
  });
});

describe("readings dictionary coverage", () => {
  // These assertions are tripwires: when a new label is added to the
  // upstream type / registry without a matching reading, the test fails
  // with the offending label clearly visible — far easier than scanning
  // the UI for missing furigana.

  it("covers every gomi category that contains kanji", () => {
    for (const label of Object.values(GOMI_CATEGORY_LABELS)) {
      const hasKanji = /[一-鿿]/.test(label);
      if (!hasKanji) continue;
      expect(
        lookupReading(label),
        `missing reading for gomi category: ${label}`,
      ).toBeDefined();
    }
  });

  it("covers every hazard label", () => {
    for (const label of Object.values(HAZARD_LABELS) as readonly string[]) {
      expect(
        lookupReading(label),
        `missing reading for hazard: ${label}`,
      ).toBeDefined();
    }
    // Touch the type so the symbol is referenced even when assertions
    // happen to be type-erased on the source map.
    const _kindAlias: HazardKind = "earthquake";
    expect(_kindAlias).toBe("earthquake");
  });

  it("covers every map layer label that contains kanji", () => {
    for (const layer of LAYERS) {
      for (const label of [layer.label, layer.shortLabel]) {
        const hasKanji = /[一-鿿]/.test(label);
        if (!hasKanji) continue;
        expect(
          lookupReading(label),
          `missing reading for layer label: ${label}`,
        ).toBeDefined();
      }
    }
  });
});
