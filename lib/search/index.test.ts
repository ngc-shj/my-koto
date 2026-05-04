import { describe, it, expect } from "vitest";
import { searchDictionary } from "./index";
import type { DictionaryItem } from "./index";
import fixtureData from "@/__fixtures__/dictionary-labels.json";

const dictionary = fixtureData as DictionaryItem[];

describe("searchDictionary", () => {
  it('finds ペットボトル when querying "ペット"', () => {
    const { items } = searchDictionary("ペット", dictionary);
    const ids = items.map((i) => i.id);
    expect(ids).toContain("pet-bottle");
  });

  it('finds both 乾電池 and リチウムイオン電池 when querying "電池"', () => {
    const { items } = searchDictionary("電池", dictionary);
    const ids = items.map((i) => i.id);
    expect(ids).toContain("battery-dry");
    expect(ids).toContain("battery-lithium");
    expect(items).toHaveLength(2);
  });

  it('hiragana "ぺっと" produces same results as katakana "ペット"', () => {
    const katakana = searchDictionary("ペット", dictionary);
    const hiragana = searchDictionary("ぺっと", dictionary);
    expect(hiragana.items.map((i) => i.id)).toEqual(
      katakana.items.map((i) => i.id)
    );
  });

  it('romaji "PET" produces same results as katakana "ペット"', () => {
    const katakana = searchDictionary("ペット", dictionary);
    const romaji = searchDictionary("PET", dictionary);
    expect(romaji.items.map((i) => i.id)).toEqual(
      katakana.items.map((i) => i.id)
    );
  });

  it('romaji lowercase "pet" produces same results as katakana "ペット"', () => {
    const katakana = searchDictionary("ペット", dictionary);
    const romaji = searchDictionary("pet", dictionary);
    expect(romaji.items.map((i) => i.id)).toEqual(
      katakana.items.map((i) => i.id)
    );
  });

  it('half-width kana "ﾍﾟｯﾄﾎﾞﾄﾙ" produces same results as katakana "ペットボトル"', () => {
    const katakana = searchDictionary("ペットボトル", dictionary);
    const halfWidth = searchDictionary("ﾍﾟｯﾄﾎﾞﾄﾙ", dictionary);
    expect(halfWidth.items.map((i) => i.id)).toEqual(
      katakana.items.map((i) => i.id)
    );
  });

  it("returns empty result for empty query", () => {
    const { items, truncated } = searchDictionary("", dictionary);
    // Empty query intentionally returns nothing (not all items).
    expect(items).toHaveLength(0);
    expect(truncated).toBe(false);
  });

  it("returns empty result for whitespace-only query", () => {
    const { items } = searchDictionary("   ", dictionary);
    expect(items).toHaveLength(0);
  });

  it("returns truncated=true for single-char query when results exceed limit", () => {
    // Build a large dictionary to trigger the truncation limit (>50 items).
    const largeDictionary: DictionaryItem[] = Array.from(
      { length: 60 },
      (_, i) => ({
        id: `item-${i}`,
        label: `あアitem${i}`,
        category: "burnable",
        instruction: "",
        note: "",
      })
    );
    const { items, truncated } = searchDictionary("あ", largeDictionary);
    expect(items).toHaveLength(50);
    expect(truncated).toBe(true);
  });

  it("returns truncated=false for single-char query when results are within limit", () => {
    // Only a small number of items contain ペ in fixture.
    const { truncated } = searchDictionary("ペ", dictionary);
    expect(truncated).toBe(false);
  });

  it("returns zero results for a query that matches nothing", () => {
    const { items } = searchDictionary("該当なし文字列xyzzy", dictionary);
    expect(items).toHaveLength(0);
  });

  it('finds リチウムイオン電池 when querying "リチウム"', () => {
    const { items } = searchDictionary("リチウム", dictionary);
    expect(items.map((i) => i.id)).toContain("battery-lithium");
  });

  // "lithium" is an English word whose romaji transcription differs from
  // wāpuro-style. The item is matched via its id "battery-lithium".
  it('finds リチウムイオン電池 when querying "lithium" (matched via item id)', () => {
    const { items } = searchDictionary("lithium", dictionary);
    expect(items.map((i) => i.id)).toContain("battery-lithium");
  });
});
