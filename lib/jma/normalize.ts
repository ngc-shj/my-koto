import type { JmaWarningResponse } from "@/lib/opendata/schemas/jma-warning";
import {
  compareWarningTier,
  describeWarningCode,
  type WarningTier,
} from "@/lib/jma/warning-codes";

export type NormalizedWarning = {
  readonly code: string | null;
  readonly label: string;
  readonly tier: WarningTier;
  // JMA "status" is one of 発表/継続/解除 etc. We pass it through so the
  // panel can hide entries that the upstream marks as cleared.
  readonly status: string;
};

export type AreaWarnings = {
  readonly reportDatetime: string;
  readonly headlineText: string;
  readonly publishingOffice: string;
  readonly areaCode: string;
  readonly warnings: readonly NormalizedWarning[];
  // Highest-severity tier present in `warnings`, or null when the area is
  // explicitly clear.
  readonly topTier: WarningTier | null;
};

// Status strings that mean "no longer in effect" — drop these so the panel
// only ever shows live alerts.
const CLEARED_STATUSES: ReadonlySet<string> = new Set(["解除"]);
// Status string the upstream uses when the area has no active alerts at all.
const NONE_STATUS = "発表警報・注意報はなし";

export function extractAreaWarnings(
  payload: JmaWarningResponse,
  areaCode: string,
): AreaWarnings {
  const base = {
    reportDatetime: payload.reportDatetime,
    headlineText: payload.headlineText ?? "",
    publishingOffice: payload.publishingOffice ?? "",
    areaCode,
  };

  for (const at of payload.areaTypes) {
    const area = at.areas.find((a) => a.code === areaCode);
    if (area == null) continue;

    const live = area.warnings.filter((w) => {
      if (w.status === NONE_STATUS) return false;
      if (CLEARED_STATUSES.has(w.status)) return false;
      return true;
    });

    if (live.length === 0) {
      return { ...base, warnings: [], topTier: null };
    }

    const normalized = live.map<NormalizedWarning>((w) => {
      const meta = describeWarningCode(w.code);
      return {
        code: w.code ?? null,
        label: meta.label,
        tier: meta.tier,
        status: w.status,
      };
    });

    // Severest tier first; within the same tier preserve the upstream order.
    const sorted = [...normalized].sort((a, b) =>
      compareWarningTier(a.tier, b.tier),
    );
    return { ...base, warnings: sorted, topTier: sorted[0]?.tier ?? null };
  }

  // Area not present in the payload — treat as "clear" rather than throw,
  // so the panel keeps rendering when JMA reshuffles area types.
  return { ...base, warnings: [], topTier: null };
}
