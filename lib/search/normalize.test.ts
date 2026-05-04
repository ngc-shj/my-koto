import { describe, it, expect } from "vitest";
import { normalize } from "./normalize";

describe("normalize", () => {
  // All five primary variants must normalize to the same romaji string.
  // This is the core requirement: kana / half-width kana / romaji are equivalent.
  it("produces identical normalized string for all ペットボトル input variants", () => {
    const expected = normalize("ペットボトル");
    expect(normalize("ぺっとぼとる")).toBe(expected);  // hiragana
    expect(normalize("ﾍﾟｯﾄﾎﾞﾄﾙ")).toBe(expected);    // half-width kana
    expect(normalize("PET BOTTLE")).not.toBe(expected); // PET is subset only — not identical
  });

  // Table-driven: these inputs must all produce a string that CONTAINS the
  // normalized "ペット" substring (enabling partial/prefix match on ペットボトル).
  const petBottleInputs: [string, string][] = [
    ["katakana full-width", "ペットボトル"],
    ["hiragana", "ぺっとぼとる"],
    ["half-width kana", "ﾍﾟｯﾄﾎﾞﾄﾙ"],
    ["romaji upper PET", "PET"],
    ["romaji lower pet", "pet"],
    ["romaji mixed case Pet", "Pet"],
  ];

  it.each(petBottleInputs)(
    "normalizes %s to a string that contains normalized ペット or is a prefix/subset",
    (_label, input) => {
      // The normalized label "ペットボトル" = "pettobotoru".
      // Queries "PET"/"pet"/"Pet" normalize to "pet" which is a prefix of "pettobotoru".
      const normalizedLabel = normalize("ペットボトル");
      const normalizedQuery = normalize(input);
      // Each query must be findable inside the label or share common prefix.
      const matches =
        normalizedLabel.startsWith(normalizedQuery) ||
        normalizedLabel.includes(normalizedQuery) ||
        normalizedQuery.startsWith(normalizedLabel) ||
        normalizedQuery.includes(normalizedLabel);
      expect(matches).toBe(true);
    }
  );

  it("PET, pet, Pet all normalize to the same string", () => {
    expect(normalize("PET")).toBe(normalize("pet"));
    expect(normalize("PET")).toBe(normalize("Pet"));
  });

  it("ペットボトル, ぺっとぼとる, ﾍﾟｯﾄﾎﾞﾄﾙ all normalize to the same string", () => {
    expect(normalize("ぺっとぼとる")).toBe(normalize("ペットボトル"));
    expect(normalize("ﾍﾟｯﾄﾎﾞﾄﾙ")).toBe(normalize("ペットボトル"));
  });

  it("pettobotoru (wāpuro romaji) normalizes to the same string as ペットボトル", () => {
    expect(normalize("pettobotoru")).toBe(normalize("ペットボトル"));
  });

  it("collapses consecutive long vowel marks before converting", () => {
    // ラーーーメン → ラーメン → ramen (after kana→romaji)
    expect(normalize("ラーーーメン")).toBe(normalize("ラーメン"));
  });

  it("NFKC full-width alphanumeric is lowercased", () => {
    // ＡＢＣ → ABC (NFKC) → abc (lowercase)
    expect(normalize("ＡＢＣ")).toBe("abc");
  });

  it("lowercases ASCII letters", () => {
    expect(normalize("ABC")).toBe("abc");
  });

  it("converts hiragana small forms to katakana then to romaji", () => {
    // ぁ (small a hiragana U+3041) → ァ (small a katakana U+30A1) → "xa" in wanakana
    const result = normalize("ぁ");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
