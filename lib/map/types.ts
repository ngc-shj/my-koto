// In-app map point model — normalized from AedRecord / ToiletRecord API shapes.
export type PointType = "aed" | "toilet";

export type MapPoint = {
  id: string;
  type: PointType;
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

export type MapFilters = {
  aed: boolean;
  toilet: boolean;
  barrierFreeOnly: boolean;
  twentyFourOnly: boolean;
};
