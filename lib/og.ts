// Allowed characters: alphanumeric (ASCII), CJK kanji, hiragana, katakana, vowel extender,
// and horizontal whitespace (space only — newlines and control chars are explicitly excluded).
// Max 60 characters to keep OG title concise.
const OG_TITLE_PATTERN = /^[a-zA-Z0-9一-龯ぁ-ゔァ-ヴー ]{1,60}$/;

/**
 * Validates an OG title candidate.
 * Returns the trimmed title if valid, or null if it fails the allowlist check.
 */
export function validateOgTitle(input: string): string | null {
  const trimmed = input.trim();
  if (!OG_TITLE_PATTERN.test(trimmed)) return null;
  return trimmed;
}
