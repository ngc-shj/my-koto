import { toKatakana, toRomaji } from "wanakana";

/**
 * Normalize a search query or dictionary label for consistent matching.
 *
 * Strategy: convert everything to romaji (ASCII lowercase) so that
 * kana input, half-width kana, hiragana, and romaji queries all
 * produce comparable strings.
 *
 * Steps applied in order:
 * 1. NFKC normalization (full-width → half-width, combining dakuten, etc.)
 * 2. Half-width kana → full-width kana (handled by NFKC)
 * 3. Hiragana → katakana
 * 4. Prolonged sound mark normalization (collapse consecutive ー into one)
 * 5. Romaji → katakana (via wanakana) for wāpuro-style romaji input
 * 6. Katakana → romaji (via wanakana) — makes kana and romaji comparable
 * 7. Lowercase (ASCII letters)
 */
export function normalize(input: string): string {
  // Step 1 & 2: NFKC covers full-width/half-width and half-width kana conversion.
  let s = input.normalize("NFKC");

  // Step 3: Hiragana (U+3041–U+3096) → katakana (shift by 0x60).
  s = s.replace(/[ぁ-ゖ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );

  // Step 4: Collapse consecutive long vowel marks into a single one.
  s = s.replace(/ー+/g, "ー");

  // Step 5: Convert wāpuro-style romaji to katakana so that e.g.
  // "pettobotoru" becomes "ペットボトル" before the romaji round-trip.
  // ASCII letters that are not valid romaji sequences (e.g. "abc") pass through
  // and are handled correctly in the final lowercase step.
  s = toKatakana(s, { IMEMode: false });

  // Step 6: Convert katakana (and any remaining kana) back to romaji.
  // This makes "ペットボトル" and "pettobotoru" produce the same ASCII string.
  // Non-kana characters (kanji, ASCII, etc.) pass through unchanged.
  s = toRomaji(s);

  // Step 7: Lowercase ASCII letters.
  s = s.toLowerCase();

  return s;
}
