// In-app map point model — normalized from AedRecord / ToiletRecord API shapes.
export type PointType = "aed" | "toilet";

// Where the row came from. Detail panels render an attribution badge keyed
// off this so the user can tell why a pin's address may be missing or
// imprecise (OSM rows are community-contributed).
export type PointSource = "koto-official" | "osm";

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
  accessibility?: {
    barrier_free: boolean;
    twenty_four_hour: boolean;
  };
};

// `null` means no radius limit (show all matched points).
// Numeric values are radius in meters.
export type RadiusOption = 500 | 1000 | 2000 | null;

export type MapFilters = {
  aed: boolean;
  toilet: boolean;
  barrierFreeOnly: boolean;
  twentyFourOnly: boolean;
  // Radius filter is only honoured when a reference location is provided.
  // If userLocation is null in the calling code, this option is ignored.
  radius: RadiusOption;
};
