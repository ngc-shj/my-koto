import type { LayerId } from "./registry";

// In-app map point model. Each row knows its layer (`type`) and its
// provenance (`source`). The accessibility / hazards extensions are
// optional and only populated for layers that publish them.
export type PointType = LayerId;

// Where the row came from. Detail panels render an attribution badge keyed
// off this so the user can tell why a pin's address may be missing or
// imprecise (OSM rows are community-contributed).
export type PointSource = "koto-official" | "tokyo-met" | "osm";

// 8 hazard categories from the Tokyo Met 避難場所 dataset. A `true` flag
// means the assembly point is designated for that hazard category.
export type HazardKind =
  | "flood"
  | "landslide"
  | "high_tide"
  | "earthquake"
  | "tsunami"
  | "large_fire"
  | "internal_flood"
  | "volcanic";

export type HazardFlags = Partial<Record<HazardKind, boolean>>;

export const HAZARD_LABELS: Record<HazardKind, string> = {
  flood: "洪水",
  landslide: "崖崩れ・土石流",
  high_tide: "高潮",
  earthquake: "地震",
  tsunami: "津波",
  large_fire: "大規模火災",
  internal_flood: "内水氾濫",
  volcanic: "火山現象",
};

export type MapPoint = {
  id: string;
  type: PointType;
  source?: PointSource;
  name: string;
  address: string;
  lat: number;
  lng: number;
  detail?: string;
  hours?: string;
  phone?: string;
  note?: string;
  // Capacity / type field used by 給水拠点 to surface 確保水量 etc.
  facilityType?: string;
  // For 避難場所 only — which hazards this site is designated for.
  hazards?: HazardFlags;
  accessibility?: {
    barrier_free: boolean;
    twenty_four_hour: boolean;
  };
};

// `null` means no radius limit (show all matched points).
// Numeric values are radius in meters.
export type RadiusOption = 500 | 1000 | 2000 | null;

export type MapFilters = {
  // Per-layer toggle, keyed by LayerId. Missing key === off.
  layers: Partial<Record<LayerId, boolean>>;
  barrierFreeOnly: boolean;
  twentyFourOnly: boolean;
  // Radius filter is only honoured when a reference location is provided.
  // If userLocation is null in the calling code, this option is ignored.
  radius: RadiusOption;
};
