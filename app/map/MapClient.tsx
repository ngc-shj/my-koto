"use client";

// Required for MapLibre to compute canvas dimensions and overlay positions.
// Without this stylesheet the map container collapses and nothing is drawn.
import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import GeolocationConsent from "@/components/GeolocationConsent";
import { KanjiText } from "@/components/Furigana";
import { MAP_INITIAL, MAP_TILE } from "@/config/map";
import MapSearch from "@/components/MapSearch";
import { clusterByPixelBucket } from "@/lib/map/cluster";
import { filterPoints, nearestPoints } from "@/lib/map/filter";
import { isLayerBundled } from "@/lib/map/registry";
import {
  HAZARD_LABELS,
  type HazardKind,
  type MapPoint,
  type MapFilters,
  type RadiusOption,
} from "@/lib/map/types";
import {
  LAYERS,
  getLayer,
  isLayerId,
  type LayerCategory,
  type LayerId,
} from "@/lib/map/registry";
import {
  KOTO_BBOX,
  TOKYO_23_BBOX,
  bboxAreaSqDeg,
  isBboxInside,
  isInsideBbox,
  snapBbox,
  type Bbox,
} from "@/config/geo";

const RADIUS_OPTIONS: { label: string; value: RadiusOption }[] = [
  { label: "500m", value: 500 },
  { label: "1km", value: 1000 },
  { label: "2km", value: 2000 },
  { label: "全件", value: null },
];

const CATEGORY_LABELS: Record<LayerCategory, string> = {
  civic: "公共施設",
  disaster: "防災",
  family: "子育て・暮らし",
  transit: "交通",
  medical: "医療",
};

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// GSI raster style — single tile source, no per-feature layers needed.
const GSI_STYLE = {
  version: 8 as const,
  sources: {
    gsi: {
      type: "raster" as const,
      tiles: [MAP_TILE.url],
      tileSize: MAP_TILE.tileSize,
      maxzoom: MAP_TILE.maxNativeZoom,
      minzoom: MAP_TILE.minNativeZoom,
      attribution: MAP_TILE.attribution,
    },
  },
  layers: [
    {
      id: "gsi-tiles",
      type: "raster" as const,
      source: "gsi",
    },
  ],
};

type UserLocation = { lat: number; lng: number } | null;

type Props = {
  points: MapPoint[];
  initialFilters: MapFilters;
};

const SOURCE_LABELS: Record<NonNullable<MapPoint["source"]>, string> = {
  "koto-official": "江東区公式",
  "tokyo-met": "東京都公式",
  osm: "OSM",
};

export default function MapClient({ points, initialFilters }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [filters, setFilters] = useState<MapFilters>(initialFilters);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation>(null);
  const [showConsentModal, setShowConsentModal] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  // Dynamic POIs fetched from /api/pois for areas outside Koto-ku.
  // Keyed by viewport-snapped bbox so cache hits stay deterministic across
  // small pan movements.
  const [externalPoints, setExternalPoints] = useState<MapPoint[]>([]);
  const [externalStatus, setExternalStatus] = useState<"idle" | "loading" | "error">("idle");
  const fetchedBboxesRef = useRef<Set<string>>(new Set());
  // Bumped on map zoom/move so renderMarkers re-runs and re-clusters using
  // the current pixel projection. visiblePoints alone does not change with
  // zoom, which is why it cannot serve as the re-render trigger.
  const [renderTick, setRenderTick] = useState(0);

  // Import maplibre-gl dynamically (browser-only)
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      const maplibregl = (await import("maplibre-gl")).default;

      if (cancelled || !mapContainerRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: GSI_STYLE,
        center: MAP_INITIAL.center,
        zoom: MAP_INITIAL.zoom,
        maxZoom: MAP_INITIAL.maxZoom,
        minZoom: MAP_INITIAL.minZoom,
        // v4: attributionControl accepts false | AttributionControlOptions (not true)
        attributionControl: {},
      });

      mapRef.current = map;
      map.on("load", () => {
        if (!cancelled) setMapReady(true);
      });
    }

    initMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Active layer ids derived once per filter change. Used by both the
  // dynamic-fetch effect and the marker renderer.
  const activeLayerIds = useMemo<LayerId[]>(
    () => LAYERS.filter((l) => filters.layers[l.id]).map((l) => l.id),
    [filters.layers],
  );

  // Merge bundled official points with whatever has been fetched from
  // /api/pois. Dedupe by id so refreshes do not double-pin.
  const mergedPoints = useMemo(() => {
    const seen = new Set<string>();
    const out: MapPoint[] = [];
    for (const p of points) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
      }
    }
    for (const p of externalPoints) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
      }
    }
    return out;
  }, [points, externalPoints]);

  // Apply radius + type filters once per dependency change. Memoise so the
  // marker rendering effect and the nearby-list panel share the same view.
  const visiblePoints = useMemo(
    () => filterPoints(mergedPoints, filters, { referencePoint: userLocation }),
    [mergedPoints, filters, userLocation],
  );

  const nearbyList = useMemo(() => {
    if (userLocation === null) return [];
    return nearestPoints(visiblePoints, userLocation, 10);
  }, [visiblePoints, userLocation]);

  // Pulls POIs from /api/pois for the current viewport. The Koto-ku area is
  // covered by the bundled official datasets, so we drop OSM rows whose
  // coordinates fall inside KOTO_BBOX to avoid double-pinning the same site.
  const maybeFetchExternalPois = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (activeLayerIds.length === 0) return;

    const b = map.getBounds();
    const live: Bbox = {
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    };
    if (bboxAreaSqDeg(live) > 0.04) {
      setExternalStatus("error");
      return;
    }
    if (!isBboxInside(live, TOKYO_23_BBOX)) {
      setExternalStatus("error");
      return;
    }

    const snapped: Bbox = snapBbox(live, 0.01);
    const sortedTypes = activeLayerIds.slice().sort();
    const cacheKey = `${sortedTypes.join("+")}|${snapped.south.toFixed(2)},${snapped.west.toFixed(2)},${snapped.north.toFixed(2)},${snapped.east.toFixed(2)}`;
    if (fetchedBboxesRef.current.has(cacheKey)) {
      setExternalStatus("idle");
      return;
    }
    fetchedBboxesRef.current.add(cacheKey);

    setExternalStatus("loading");
    try {
      const params = new URLSearchParams({
        bbox: `${snapped.south.toFixed(2)},${snapped.west.toFixed(2)},${snapped.north.toFixed(2)},${snapped.east.toFixed(2)}`,
        types: sortedTypes.join(","),
      });
      const res = await fetch(`/api/pois?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { records: MapPoint[] };
      setExternalPoints((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const fresh = body.records.filter((p) => {
          if (seen.has(p.id)) return false;
          // Only drop Koto-bbox OSM rows for layers we ship a bundled
          // Koto dataset for; OSM-only layers (e.g. station) must keep
          // their Koto rows or the map would be empty inside the ward.
          if (isLayerId(p.type) && isLayerBundled(p.type) && isInsideBbox(p, KOTO_BBOX)) {
            return false;
          }
          return true;
        });
        return fresh.length === 0 ? prev : [...prev, ...fresh];
      });
      setExternalStatus("idle");
    } catch {
      fetchedBboxesRef.current.delete(cacheKey);
      setExternalStatus("error");
    }
  }, [mapReady, activeLayerIds]);

  // Wire the fetcher to map idle events with a small debounce so rapid
  // panning does not flood /api/pois.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void maybeFetchExternalPois();
      }, 400);
    };
    map.on("moveend", handler);
    handler();
    return () => {
      if (timer) clearTimeout(timer);
      map.off("moveend", handler);
    };
  }, [mapReady, maybeFetchExternalPois]);

  // Render markers when map is ready or visiblePoints change. Points that
  // collapse into the same pixel bucket are aggregated into one cluster
  // bubble; clicking the bubble zooms in until the bucket separates.
  const renderMarkers = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const maplibregl = (await import("maplibre-gl")).default;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Each cluster bubble is 36 px, matching the bucket size so two adjacent
    // singletons cannot visually touch a cluster.
    const BUCKET_SIZE = 36;
    const layerPoints = visiblePoints.filter((p) => isLayerId(p.type));
    const clusters = clusterByPixelBucket(
      layerPoints,
      (p) => map.project([p.lng, p.lat]),
      BUCKET_SIZE,
    );

    for (const cluster of clusters) {
      if (cluster.points.length === 1) {
        const point = cluster.points[0];
        if (point == null) continue;
        const layer = getLayer(point.type as Parameters<typeof getLayer>[0]);
        const isOsm = point.source === "osm";
        const el = document.createElement("div");
        el.className = "map-marker";
        el.setAttribute("role", "button");
        el.setAttribute(
          "aria-label",
          `${point.name}${isOsm ? " (OSM)" : ""}`,
        );
        el.style.cssText = `
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid white;
          cursor: pointer;
          background-color: ${isOsm ? "#ffffff" : layer.color};
          outline: ${isOsm ? `2px solid ${layer.color}` : "none"};
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${isOsm ? layer.color : "white"};
          font-size: 12px;
          font-weight: bold;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        `;
        el.textContent = layer.letter;
        el.addEventListener("click", () => setSelectedPoint(point));

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([point.lng, point.lat])
          .addTo(map);
        markersRef.current.push(marker);
      } else {
        const count = cluster.points.length;
        const el = document.createElement("button");
        el.type = "button";
        el.className = "map-cluster";
        el.setAttribute("aria-label", `${count} 件の地点 (クリックで拡大)`);
        el.style.cssText = `
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px solid white;
          cursor: pointer;
          background-color: rgba(71,85,105,0.9);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          padding: 0;
        `;
        el.textContent = count >= 100 ? "99+" : String(count);
        el.addEventListener("click", () => {
          const nextZoom = Math.min(
            map.getZoom() + 2,
            map.getMaxZoom(),
          );
          map.flyTo({
            center: [cluster.center.lng, cluster.center.lat],
            zoom: nextZoom,
          });
        });

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([cluster.center.lng, cluster.center.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    }
  }, [visiblePoints, mapReady]);

  useEffect(() => {
    void renderMarkers();
    // renderTick triggers re-clustering on zoom/move without invalidating
    // visiblePoints; it is intentionally read only as a dependency.
  }, [renderMarkers, renderTick]);

  // Schedule a re-cluster after pan/zoom settles so bucket positions reflect
  // the new projection. Debounced to coalesce rapid wheel zooms.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRenderTick((n) => n + 1), 80);
    };
    map.on("zoomend", bump);
    map.on("moveend", bump);
    return () => {
      if (timer) clearTimeout(timer);
      map.off("zoomend", bump);
      map.off("moveend", bump);
    };
  }, [mapReady]);

  // Render user location marker
  useEffect(() => {
    if (!mapReady || userLocation === null) return;

    const initUserMarker = async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      const map = mapRef.current;
      if (!map) return;

      userMarkerRef.current?.remove();
      const el = document.createElement("div");
      el.style.cssText = `
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background-color: #7c3aed;
        border: 3px solid white;
        box-shadow: 0 0 0 2px #7c3aed;
      `;
      el.setAttribute("aria-label", "現在地");
      userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);

      map.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 15 });
    };

    initUserMarker();

    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    };
  }, [userLocation, mapReady]);

  function handleConsentGrant(position: GeolocationPosition) {
    setShowConsentModal(false);
    setUserLocation({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    });
  }

  function handleConsentDeny() {
    setShowConsentModal(false);
  }

  function toggleLayer(id: LayerId) {
    setFilters((prev) => ({
      ...prev,
      layers: { ...prev.layers, [id]: !prev.layers[id] },
    }));
  }

  function toggleAccessibility(key: "barrierFreeOnly" | "twentyFourOnly") {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setRadius(radius: RadiusOption) {
    setFilters((prev) => ({ ...prev, radius }));
  }

  function focusPoint(point: MapPoint) {
    setSelectedPoint(point);
    mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 17 });
  }

  const googleMapsUrl = selectedPoint
    ? `https://www.google.com/maps?q=${selectedPoint.lat},${selectedPoint.lng}`
    : null;

  // Group layers by category for the expanded panel. Each list is a fresh
  // mutable array so .push() is safe (LAYERS itself is readonly).
  const groupedLayers = useMemo(() => {
    const map = new Map<LayerCategory, (typeof LAYERS)[number][]>();
    for (const l of LAYERS) {
      const list = map.get(l.category) ?? [];
      list.push(l);
      map.set(l.category, list);
    }
    return Array.from(map.entries());
  }, []);

  const activeLayerCount = activeLayerIds.length;

  // Per-layer point counts derived from the merged catalog (bundled +
  // dynamic OSM). OSM-only layers start at 0 until the viewport fetch
  // returns, so the chip badge naturally appears once data is available.
  const pointCountByLayer = useMemo(() => {
    const counts = new Map<LayerId, number>();
    for (const p of mergedPoints) {
      if (!isLayerId(p.type)) continue;
      counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    }
    return counts;
  }, [mergedPoints]);

  const selectedLayer = selectedPoint && isLayerId(selectedPoint.type)
    ? getLayer(selectedPoint.type)
    : null;
  const selectedHazards = selectedPoint?.hazards
    ? (Object.entries(selectedPoint.hazards) as [HazardKind, boolean][])
        .filter(([, v]) => v)
        .map(([k]) => k)
    : [];

  return (
    <div className="relative w-full h-full">
      {showConsentModal && (
        <GeolocationConsent onConsent={handleConsentGrant} onDeny={handleConsentDeny} />
      )}

      <div ref={mapContainerRef} className="w-full h-full" aria-label="地図" />

      {externalStatus !== "idle" && (
        <div
          aria-live="polite"
          className="absolute top-3 right-3 z-10 bg-white rounded-full shadow px-3 py-1 text-xs text-slate-700 border border-slate-200"
        >
          {externalStatus === "loading"
            ? "区外データを取得中…"
            : "区外データの取得に失敗しました"}
        </div>
      )}

      {/* Layer panel */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col gap-1.5 items-center max-w-[min(95vw,32rem)]">
        <div className="bg-white rounded-xl shadow border border-slate-200">
          <button
            type="button"
            onClick={() => setLayerPanelOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700"
            // eslint-disable-next-line jsx-a11y/aria-proptypes
            aria-expanded={layerPanelOpen ? "true" : "false"}
          >
            <span className="font-medium">レイヤ</span>
            <span className="text-xs text-slate-500">
              {activeLayerCount > 0 ? `${activeLayerCount} 件 ON` : "全 OFF"}
            </span>
            <span aria-hidden="true" className="text-slate-400 text-xs">
              {layerPanelOpen ? "▲" : "▼"}
            </span>
          </button>
          {layerPanelOpen && (
            <div className="px-3 pb-3 pt-3 space-y-3 border-t border-slate-100">
              <MapSearch points={points} onPick={focusPoint} />
              {groupedLayers.map(([category, layers]) => (
                <fieldset key={category} className="space-y-1.5">
                  <legend className="text-xs font-semibold text-slate-500">
                    {CATEGORY_LABELS[category]}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {layers.map((l) => (
                      <LayerChip
                        key={l.id}
                        layer={l}
                        active={filters.layers[l.id] === true}
                        count={pointCountByLayer.get(l.id) ?? 0}
                        onClick={() => toggleLayer(l.id)}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                <FilterChip
                  active={filters.barrierFreeOnly}
                  label="バリアフリー"
                  onClick={() => toggleAccessibility("barrierFreeOnly")}
                />
                <FilterChip
                  active={filters.twentyFourOnly}
                  label="24h"
                  onClick={() => toggleAccessibility("twentyFourOnly")}
                />
              </div>
            </div>
          )}
        </div>
        {userLocation !== null && (
          <div
            className="bg-white rounded-full shadow px-3 py-1.5 flex gap-2 flex-wrap justify-center items-center"
            role="group"
            aria-label="現在地からの距離で絞り込み"
          >
            <span className="text-xs text-gray-600 mr-1">表示範囲</span>
            {RADIUS_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setRadius(opt.value)}
                // eslint-disable-next-line jsx-a11y/aria-proptypes
                aria-pressed={filters.radius === opt.value}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filters.radius === opt.value
                    ? "bg-slate-700 text-white border-transparent"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Nearby list panel */}
      {userLocation !== null && nearbyList.length > 0 && !selectedPoint && (
        <aside
          aria-label="現在地から近い順のリスト"
          className="absolute bottom-3 right-3 z-10 w-64 max-h-[40vh] bg-white rounded-xl shadow-lg overflow-hidden flex flex-col"
        >
          <header className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
            周辺リスト ({nearbyList.length} 件)
          </header>
          <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {nearbyList.map((p) => {
              const layer = isLayerId(p.type) ? getLayer(p.type) : null;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => focusPoint(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: layer?.color ?? "#64748b" }}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{p.name}</span>
                      <span className="block text-xs text-gray-500">
                        {formatDistance(p.distance)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      )}

      {/* Detail panel */}
      {selectedPoint && selectedLayer && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="detail-title"
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl shadow-lg p-4 z-10 max-h-[60vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap gap-1 mb-1">
                <span
                  className="inline-block text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: selectedLayer.color }}
                >
                  <KanjiText text={selectedLayer.label} />
                </span>
                {selectedPoint.source && (
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full border ${
                      selectedPoint.source === "osm"
                        ? "bg-amber-100 text-amber-800 border-amber-300"
                        : "bg-emerald-100 text-emerald-800 border-emerald-300"
                    }`}
                  >
                    {SOURCE_LABELS[selectedPoint.source]}
                  </span>
                )}
              </div>
              <h2 id="detail-title" className="text-base font-semibold">
                {selectedPoint.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPoint(null)}
              aria-label="閉じる"
              className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0"
            >
              ×
            </button>
          </div>

          {selectedPoint.address ? (
            <p className="text-sm text-gray-600 mt-1">{selectedPoint.address}</p>
          ) : (
            <p className="text-sm text-gray-400 mt-1 italic">
              住所情報なし (地図上の座標で確認してください)
            </p>
          )}
          {selectedPoint.source === "osm" && (
            <p className="text-xs text-amber-700 mt-1">
              この情報は OpenStreetMap contributors により提供されています。実際の状況と異なる場合があります。
            </p>
          )}

          {selectedPoint.detail && (
            <p className="text-sm text-gray-600 mt-2">
              <span className="font-medium">詳細:</span> {selectedPoint.detail}
            </p>
          )}
          {selectedPoint.hours && (
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-medium">利用可能時間:</span> {selectedPoint.hours}
            </p>
          )}
          {selectedPoint.phone && (
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-medium">電話:</span> {selectedPoint.phone}
            </p>
          )}

          {selectedHazards.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-600 mb-1">
                対応災害種別
              </p>
              <div className="flex flex-wrap gap-1">
                {selectedHazards.map((h) => (
                  <span
                    key={h}
                    className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300"
                  >
                    <KanjiText text={HAZARD_LABELS[h]} />
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedPoint.accessibility && (
            <div className="flex gap-2 mt-2 flex-wrap">
              <AccessBadge
                label="バリアフリー"
                active={selectedPoint.accessibility.barrier_free}
              />
              {selectedPoint.type !== "shelter" && (
                <AccessBadge
                  label="24時間"
                  active={selectedPoint.accessibility.twenty_four_hour}
                />
              )}
            </div>
          )}

          {selectedPoint.type === "aed" && (
            <p className="mt-2 text-sm font-semibold text-red-700 bg-red-50 rounded px-3 py-2">
              緊急時は119番への通報を最優先にしてください。
            </p>
          )}

          {selectedPoint.note && (
            <p className="text-xs text-gray-500 mt-2">{selectedPoint.note}</p>
          )}

          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm text-blue-600 underline hover:text-blue-800"
            >
              Google Maps で開く
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function LayerChip({
  layer,
  active,
  count,
  onClick,
}: {
  layer: (typeof LAYERS)[number];
  active: boolean;
  // Number of merged points currently classified under this layer. Zero
  // is rendered as a hint (OSM layers stay 0 until the user toggles them
  // on and the viewport fetch returns), so we suppress the badge then.
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        count > 0 ? `${layer.label} (${count} 件)` : layer.label
      }
      // eslint-disable-next-line jsx-a11y/aria-proptypes
      aria-pressed={active ? "true" : "false"}
      className="text-xs px-3 py-1 rounded-full border transition-colors flex items-center gap-1.5"
      style={
        active
          ? {
              backgroundColor: layer.color,
              color: "white",
              borderColor: "transparent",
            }
          : {
              backgroundColor: "white",
              color: "#475569",
              borderColor: "#cbd5e1",
            }
      }
    >
      <span
        aria-hidden="true"
        className="inline-block w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
        style={{
          backgroundColor: active ? "rgba(255,255,255,0.3)" : layer.color,
          color: "white",
        }}
      >
        {layer.letter}
      </span>
      <KanjiText text={layer.shortLabel} />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="ml-0.5 text-[10px] tabular-nums opacity-80"
        >
          {count >= 1000 ? `${Math.floor(count / 100) / 10}k` : count}
        </span>
      )}
    </button>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // eslint-disable-next-line jsx-a11y/aria-proptypes
      aria-pressed={active ? "true" : "false"}
      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
        active
          ? "bg-slate-700 text-white border-transparent"
          : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function AccessBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${
        active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
      }`}
    >
      {label}: {active ? "○" : "×"}
    </span>
  );
}
