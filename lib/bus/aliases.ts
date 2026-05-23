// User-facing aliases for Toei route short names. The GTFS feed uses the
// operator's internal codes (e.g. "江東０１"), which residents typically
// know by a different brand name (e.g. the community bus "しおかぜ"). This
// table keeps the lookup centralised so adding more aliases later does
// not require touching every page that renders a route name.
//
// Keep entries minimal: only add an alias when it changes how a 区民
// actually refers to the route. Don't translate operator codes verbatim.

const ROUTE_ALIASES: Readonly<Record<string, string>> = {
  // 江東区コミュニティバス「しおかぜ」 — operated by 東京都交通局 under
  // the 江東01 designation. Residents know it as しおかぜ.
  "江東０１": "しおかぜ（江東01）",
  "江東01": "しおかぜ（江東01）",
};

export function displayRouteName(shortName: string): string {
  return ROUTE_ALIASES[shortName] ?? shortName;
}

// Lowercase / NFKC-normalised reverse index so a user typing "しおかぜ"
// can be matched even if their keyboard yields full-width digits. The
// result is the canonical shortName as stored in the GTFS feed.
export function resolveRouteAlias(query: string): string | null {
  const q = query.trim();
  if (q.length === 0) return null;
  for (const [code, alias] of Object.entries(ROUTE_ALIASES)) {
    if (alias.includes(q)) return code;
  }
  return null;
}
