// Pure helpers backing the home-page JMA banners. They live in a plain
// module (no "use client" directive) so the Banner components can stay
// client-only while their selection logic remains importable by tests
// and by potential server-side render paths without crossing the
// React Server Components boundary.

import type { AreaWarnings, NormalizedWarning } from "@/lib/jma/normalize";
import type { NormalizedQuake, QuakeFeed } from "@/lib/jma/quake";

// Home banner only surfaces 警報 and 特別警報 — keeping 注意報 silent so
// the landing page does not turn into a yellow stripe every time the wind
// picks up. The detailed list still lives on /weather.
export function escalateBannerWarnings(
  data: AreaWarnings,
): {
  warnings: readonly NormalizedWarning[];
  topTier: "special" | "warning";
} | null {
  const escalated = data.warnings.filter(
    (w) => w.tier === "special" || w.tier === "warning",
  );
  if (escalated.length === 0) return null;
  const topTier: "special" | "warning" = escalated.some(
    (w) => w.tier === "special",
  )
    ? "special"
    : "warning";
  return { warnings: escalated, topTier };
}

// Quake banner only fires for events the ward actually felt at 震度 2 or
// above within the last day. Anything older or weaker stays silent so the
// banner is meaningful when it appears.
const QUAKE_HORIZON_MS = 24 * 60 * 60 * 1000;
const QUAKE_MIN_SHINDO_DIGIT = 2;

export function pickBannerQuake(
  feed: QuakeFeed,
  now: Date,
): NormalizedQuake | null {
  for (const q of feed.events) {
    if (q.kotoShindo == null) continue;
    const head = q.kotoShindo[0];
    if (head == null) continue;
    const digit = Number.parseInt(head, 10);
    if (!Number.isFinite(digit) || digit < QUAKE_MIN_SHINDO_DIGIT) continue;
    const occurredMs = Date.parse(q.occurredAt);
    if (!Number.isFinite(occurredMs)) continue;
    if (now.getTime() - occurredMs > QUAKE_HORIZON_MS) continue;
    return q;
  }
  return null;
}
