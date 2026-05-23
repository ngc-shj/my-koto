// Pixel-grid clustering. Each input point is projected to screen pixels
// via the caller-supplied projector (typically maplibre map.project) and
// bucketed into a `bucketSize`-pixel grid. Points sharing a bucket are
// returned as one cluster whose center is the lng/lat centroid of its
// members. Pure / framework-free so it can be unit tested without a map.

type LngLat = { lat: number; lng: number };
type Pixel = { x: number; y: number };

export type Cluster<T extends LngLat> = {
  readonly points: readonly T[];
  readonly center: LngLat;
};

export function clusterByPixelBucket<T extends LngLat>(
  points: readonly T[],
  project: (p: LngLat) => Pixel,
  bucketSize: number,
): readonly Cluster<T>[] {
  if (bucketSize <= 0) {
    throw new Error("bucketSize must be positive");
  }
  const buckets = new Map<string, T[]>();
  for (const point of points) {
    const px = project(point);
    const bx = Math.floor(px.x / bucketSize);
    const by = Math.floor(px.y / bucketSize);
    const key = `${bx}:${by}`;
    const arr = buckets.get(key);
    if (arr == null) {
      buckets.set(key, [point]);
    } else {
      arr.push(point);
    }
  }
  const out: Cluster<T>[] = [];
  for (const arr of buckets.values()) {
    const n = arr.length;
    let latSum = 0;
    let lngSum = 0;
    for (const p of arr) {
      latSum += p.lat;
      lngSum += p.lng;
    }
    out.push({
      points: arr,
      center: { lat: latSum / n, lng: lngSum / n },
    });
  }
  return out;
}
