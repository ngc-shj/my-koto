import { normalize } from "./normalize";

// Maximum results returned for a single-character query.
const SINGLE_CHAR_LIMIT = 50;

export type DictionaryItem = {
  id: string;
  label: string;
  category: string;
  instruction: string;
  note: string;
};

export type SearchResult = {
  items: DictionaryItem[];
  /** True when results were truncated because the query was too short. */
  truncated: boolean;
};

/**
 * Build a searchable text for an item by combining normalized label and
 * the raw id (ASCII slug). The id acts as an English keyword index so that
 * queries like "lithium" match "battery-lithium" even when the romaji
 * normalization of the Japanese label differs from the English term.
 */
function buildSearchKey(item: DictionaryItem): string {
  return normalize(item.label) + " " + item.id.toLowerCase();
}

/**
 * Search a dictionary by label using prefix and substring matching.
 *
 * - Empty query returns an empty result set (not all items).
 * - Single-character query returns up to SINGLE_CHAR_LIMIT items with truncated=true
 *   when the full result count exceeds that limit.
 * - Multi-character query returns all matches with truncated=false.
 */
export function searchDictionary(
  query: string,
  dictionary: DictionaryItem[]
): SearchResult {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return { items: [], truncated: false };
  }

  const normalizedQuery = normalize(trimmed);
  // Also keep the raw lowercased query for id-based matching.
  const rawQuery = trimmed.toLowerCase();

  const matched = dictionary.filter((item) => {
    const searchKey = buildSearchKey(item);
    return (
      searchKey.startsWith(normalizedQuery) ||
      searchKey.includes(normalizedQuery) ||
      searchKey.includes(rawQuery)
    );
  });

  if (trimmed.length === 1 && matched.length > SINGLE_CHAR_LIMIT) {
    return {
      items: matched.slice(0, SINGLE_CHAR_LIMIT),
      truncated: true,
    };
  }

  return { items: matched, truncated: false };
}
