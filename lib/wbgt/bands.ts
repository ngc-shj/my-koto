// Heat-illness alert bands per 環境省 「日常生活における熱中症予防指針 Ver.4」.
// Centralised here so /weather (full panel) and / (Today summary single-line
// readout) classify a WBGT value the exact same way.
//
// `≥` boundaries are inclusive so a reading of 28.0 °C lands on 厳重警戒
// rather than 警戒. The list is ordered hottest-first; classify() returns
// the first band whose threshold the value clears.

export type WbgtBand = {
  readonly threshold: number;
  readonly label: string;
  // Tailwind utility classes for the badge background+foreground. UIs can
  // override but should keep contrast at the same level.
  readonly tone: string;
  // Human-readable advisory shown next to the badge in long-form panels.
  readonly note: string;
};

export const WBGT_BANDS: readonly WbgtBand[] = [
  {
    threshold: 31,
    label: "危険",
    tone: "bg-red-700 text-white",
    note: "高齢者は安静状態でも発生する危険性。外出はなるべく避ける",
  },
  {
    threshold: 28,
    label: "厳重警戒",
    tone: "bg-orange-600 text-white",
    note: "外出時は炎天下を避け、室内では室温の上昇に注意",
  },
  {
    threshold: 25,
    label: "警戒",
    tone: "bg-amber-500 text-white",
    note: "運動や激しい作業をする際は定期的に十分な休息を取り入れる",
  },
  {
    threshold: 21,
    label: "注意",
    tone: "bg-yellow-300 text-yellow-900",
    note: "一般に危険性は少ないが激しい運動・重労働時には熱中症の発生に注意",
  },
  {
    threshold: 0,
    label: "ほぼ安全",
    tone: "bg-emerald-600 text-white",
    note: "通常生活で熱中症の危険は低い",
  },
];

export function classifyWbgt(value: number): WbgtBand {
  for (const band of WBGT_BANDS) {
    if (value >= band.threshold) return band;
  }
  // The last entry has threshold 0 so this fallback only fires for negative
  // readings, which the upstream forecast never produces.
  return WBGT_BANDS[WBGT_BANDS.length - 1];
}
