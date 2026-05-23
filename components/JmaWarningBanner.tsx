"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KanjiText } from "@/components/Furigana";
import type { AreaWarnings, NormalizedWarning } from "@/lib/jma/normalize";

type State =
  | { status: "loading" }
  | { status: "none" }
  | { status: "active"; warnings: readonly NormalizedWarning[]; topTier: "special" | "warning" };

function isAreaWarnings(v: unknown): v is AreaWarnings {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.reportDatetime === "string" &&
    typeof o.areaCode === "string" &&
    Array.isArray(o.warnings)
  );
}

// Home banner only surfaces 警報 and 特別警報 — keeping 注意報 silent so
// the landing page does not turn into a yellow stripe every time the wind
// picks up. The detailed list still lives on /weather.
export function escalateBannerWarnings(
  data: AreaWarnings,
): { warnings: readonly NormalizedWarning[]; topTier: "special" | "warning" } | null {
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

const TIER_STYLE: Record<"special" | "warning", { container: string; badge: string; label: string }> = {
  special: {
    container: "border-purple-400 bg-purple-50 text-purple-900",
    badge: "bg-purple-700 text-white",
    label: "特別警報発表中",
  },
  warning: {
    container: "border-red-400 bg-red-50 text-red-900",
    badge: "bg-red-600 text-white",
    label: "警報発表中",
  },
};

export default function JmaWarningBanner() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/jma-warnings", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          setState({ status: "none" });
          return;
        }
        const raw: unknown = await res.json();
        if (!isAreaWarnings(raw)) {
          setState({ status: "none" });
          return;
        }
        const escalated = escalateBannerWarnings(raw);
        if (escalated == null) {
          setState({ status: "none" });
          return;
        }
        setState({ status: "active", ...escalated });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        // Banner is decorative when the API fails — fall back to silent
        // rather than show a noisy error in the hero slot.
        setState({ status: "none" });
      });
    return () => controller.abort();
  }, []);

  if (state.status !== "active") return null;

  const style = TIER_STYLE[state.topTier];
  const summary = state.warnings.map((w) => w.label).join("・");

  return (
    <Link
      href="/weather"
      role="alert"
      className={`block rounded-lg border-2 p-3 ${style.container} hover:brightness-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500`}
      aria-label={`${style.label} 江東区 ${summary}。詳細を確認`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
          <KanjiText text={style.label} />
        </span>
        <span className="font-semibold">
          <KanjiText text={summary} />
        </span>
        <span className="ml-auto text-xs underline">
          <KanjiText text="詳細を確認" />
        </span>
      </div>
    </Link>
  );
}
