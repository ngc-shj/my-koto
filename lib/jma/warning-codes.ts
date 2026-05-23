// JMA warning/advisory code → Japanese label + severity tier.
//
// Reference: 気象庁 防災気象情報の種類
// https://www.jma.go.jp/jma/kishou/know/bosai/warning.html
//
// Tier mapping (severest first):
//   special  — 特別警報 (codes 32–38)
//   warning  — 警報     (codes 03–09)
//   info     — 気象情報 / 記録的短時間大雨情報 (code 27)
//   advisory — 注意報   (codes 10–26)
//
// Anything not in this table is folded into "advisory" with the raw code
// surfaced as the label so the UI never silently drops a real alert.

export type WarningTier = "special" | "warning" | "info" | "advisory";

type WarningMeta = { label: string; tier: WarningTier };

const TABLE: Readonly<Record<string, WarningMeta>> = {
  // 特別警報
  "32": { label: "暴風雪特別警報", tier: "special" },
  "33": { label: "大雨特別警報", tier: "special" },
  "35": { label: "大雪特別警報", tier: "special" },
  "36": { label: "暴風特別警報", tier: "special" },
  "37": { label: "波浪特別警報", tier: "special" },
  "38": { label: "高潮特別警報", tier: "special" },
  // 警報
  "02": { label: "暴風雪警報", tier: "warning" },
  "03": { label: "大雨警報", tier: "warning" },
  "04": { label: "洪水警報", tier: "warning" },
  "05": { label: "暴風警報", tier: "warning" },
  "06": { label: "大雪警報", tier: "warning" },
  "07": { label: "波浪警報", tier: "warning" },
  "08": { label: "高潮警報", tier: "warning" },
  // 気象情報 (短時間大雨)
  "27": { label: "記録的短時間大雨情報", tier: "info" },
  // 注意報
  "10": { label: "大雨注意報", tier: "advisory" },
  "12": { label: "大雪注意報", tier: "advisory" },
  "13": { label: "風雪注意報", tier: "advisory" },
  "14": { label: "雷注意報", tier: "advisory" },
  "15": { label: "強風注意報", tier: "advisory" },
  "16": { label: "波浪注意報", tier: "advisory" },
  "17": { label: "融雪注意報", tier: "advisory" },
  "18": { label: "洪水注意報", tier: "advisory" },
  "19": { label: "高潮注意報", tier: "advisory" },
  "20": { label: "濃霧注意報", tier: "advisory" },
  "21": { label: "乾燥注意報", tier: "advisory" },
  "22": { label: "なだれ注意報", tier: "advisory" },
  "23": { label: "低温注意報", tier: "advisory" },
  "24": { label: "霜注意報", tier: "advisory" },
  "25": { label: "着氷注意報", tier: "advisory" },
  "26": { label: "着雪注意報", tier: "advisory" },
};

export function describeWarningCode(code: string | undefined): WarningMeta {
  if (code != null) {
    const hit = TABLE[code];
    if (hit != null) return hit;
  }
  return {
    label: code != null && code.length > 0 ? `コード ${code}` : "気象情報",
    tier: "advisory",
  };
}

const TIER_RANK: Record<WarningTier, number> = {
  special: 0,
  warning: 1,
  info: 2,
  advisory: 3,
};

export function compareWarningTier(a: WarningTier, b: WarningTier): number {
  return TIER_RANK[a] - TIER_RANK[b];
}
