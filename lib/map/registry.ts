// Single source of truth for every map layer the app knows about.
//
// Adding a new layer means appending one entry here. Everything else
// (filter UI, marker rendering, OSM Overpass query composition, OSM tag
// classification, popup formatting) is data-driven from this registry.
//
// Phase 1 covers AED + 公衆トイレ (existing) plus 防災 (避難所・避難場所・
// 給水拠点). Phase 2 will add 子育て・暮らし layers without touching the
// abstraction.

export type LayerId =
  | "aed"
  | "toilet"
  | "shelter"
  | "assembly_point"
  | "water_supply";

export type LayerCategory = "civic" | "disaster";

export type OsmTag = { readonly key: string; readonly value: string };

export type LayerConfig = {
  readonly id: LayerId;
  readonly label: string; // e.g. "公衆トイレ" — used in popups
  readonly shortLabel: string; // e.g. "トイレ" — used in filter chips
  readonly category: LayerCategory;
  // Tailwind-class palette for the marker / chip. Hex codes embedded so
  // MapClient can apply them inline (markers are absolute-positioned divs).
  readonly color: string; // e.g. "#dc2626"
  readonly letter: string; // single-character marker glyph
  // OSM tag pairs that mean "this row IS this layer". A row matches if any
  // pair in this list is present in its tags. Order is irrelevant.
  readonly osmTags: readonly OsmTag[];
  // Fallback name used when an OSM row has no name tag.
  readonly defaultName: string;
};

export const LAYERS: readonly LayerConfig[] = [
  {
    id: "aed",
    label: "AED",
    shortLabel: "AED",
    category: "civic",
    color: "#dc2626", // red-600
    letter: "A",
    osmTags: [
      { key: "emergency", value: "defibrillator" },
      { key: "healthcare", value: "defibrillator" },
    ],
    defaultName: "AED",
  },
  {
    id: "toilet",
    label: "公衆トイレ",
    shortLabel: "トイレ",
    category: "civic",
    color: "#2563eb", // blue-600
    letter: "T",
    osmTags: [{ key: "amenity", value: "toilets" }],
    defaultName: "公衆トイレ",
  },
  {
    id: "shelter",
    label: "避難所",
    shortLabel: "避難所",
    category: "disaster",
    color: "#9333ea", // purple-600
    letter: "避",
    osmTags: [
      { key: "amenity", value: "shelter" },
      { key: "emergency", value: "shelter" },
    ],
    defaultName: "避難所",
  },
  {
    id: "assembly_point",
    label: "避難場所",
    shortLabel: "避難場所",
    category: "disaster",
    color: "#7e22ce", // purple-700
    letter: "場",
    osmTags: [{ key: "emergency", value: "assembly_point" }],
    defaultName: "避難場所",
  },
  {
    id: "water_supply",
    label: "給水拠点",
    shortLabel: "給水",
    category: "disaster",
    color: "#0891b2", // cyan-600
    letter: "水",
    osmTags: [
      { key: "emergency", value: "drinking_water" },
      { key: "amenity", value: "drinking_water" },
    ],
    defaultName: "給水拠点",
  },
];

const BY_ID = new Map<LayerId, LayerConfig>(LAYERS.map((l) => [l.id, l]));

export const LAYER_IDS: readonly LayerId[] = LAYERS.map((l) => l.id);

export function getLayer(id: LayerId): LayerConfig {
  const cfg = BY_ID.get(id);
  if (!cfg) {
    // The compiler ensures id is constrained, but a stale persisted URL
    // could feed an unknown literal — fall back to a clearly-broken sentinel.
    throw new Error(`Unknown layer id: ${id}`);
  }
  return cfg;
}

export function isLayerId(value: string): value is LayerId {
  return BY_ID.has(value as LayerId);
}

// Classify an OSM element's tags into a layer id, or null when no layer
// applies. Iterates registry in declaration order; the first match wins.
export function classifyOsmTags(
  tags: Record<string, string> | undefined,
): LayerId | null {
  if (!tags) return null;
  for (const layer of LAYERS) {
    for (const t of layer.osmTags) {
      if (tags[t.key] === t.value) return layer.id;
    }
  }
  return null;
}
