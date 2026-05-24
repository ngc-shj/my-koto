// Product User-Agent strings shared across every upstream fetch in the
// codebase. Centralised so a future rebrand touches one file, not seven.
export const PRODUCT_UA = "my-koto/1.0 (+/about)";

// Overpass's Apache rejects User-Agents whose parenthetical comment does
// not look like a full URL — "(+/about)" earned us a 406 in every
// request. A clean product/version token works.
export const PRODUCT_UA_BARE = "my-koto/1.0";
