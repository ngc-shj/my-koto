"use client";

// Required for MapLibre to compute canvas dimensions and overlay positions.
// Without this stylesheet the map container collapses and nothing is drawn.
import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import GeolocationConsent from "@/components/GeolocationConsent";
import { MAP_INITIAL, MAP_TILE } from "@/config/map";
import { filterPoints, nearestPoints } from "@/lib/map/filter";
import type { MapPoint, MapFilters, RadiusOption, PointType } from "@/lib/map/types";
import {
  KOTO_BBOX,
  TOKYO_23_BBOX,
  bboxAreaSqDeg,
  isBboxInside,
  isInsideBbox,
  type Bbox,
} from "@/config/geo";

const RADIUS_OPTIONS: { label: string; value: RadiusOption }[] = [
  { label: "500m", value: 500 },
  { label: "1km", value: 1000 },
  { label: "2km", value: 2000 },
  { label: "全件", value: null },
];

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
  // Dynamic POIs fetched from /api/pois for areas outside Koto-ku.
  // Keyed by viewport-snapped bbox so cache hits stay deterministic across
  // small pan movements.
  const [externalPoints, setExternalPoints] = useState<MapPoint[]>([]);
  const [externalStatus, setExternalStatus] = useState<"idle" | "loading" | "error">("idle");
  const fetchedBboxesRef = useRef<Set<string>>(new Set());

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

  // Merge bundled Koto-official points with whatever has been fetched from
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

  // Pulls POIs from /api/pois for the current viewport whenever the map
  // pans into territory not already cached on the client. Snaps the bbox
  // to a 0.02° grid (≈2km) so small pans share fetches.
  const maybeFetchExternalPois = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!filters.aed && !filters.toilet) return;

    const b = map.getBounds();
    const live: Bbox = {
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    };
    if (bboxAreaSqDeg(live) > 0.04) return; // Too zoomed out — skip fetch.
    if (!isBboxInside(live, TOKYO_23_BBOX)) return;

    // If the entire viewport is inside Koto-ku, the bundled dataset already
    // covers it and we do not need OSM augmentation.
    const fullyInsideKoto =
      live.south >= KOTO_BBOX.south &&
      live.north <= KOTO_BBOX.north &&
      live.west >= KOTO_BBOX.west &&
      live.east <= KOTO_BBOX.east;
    if (fullyInsideKoto) return;

    const step = 0.02;
    const round = (n: number) => Math.round(n / step) * step;
    const snapped: Bbox = {
      south: round(live.south),
      west: round(live.west),
      north: round(live.north),
      east: round(live.east),
    };
    const types: PointType[] = [];
    if (filters.aed) types.push("aed");
    if (filters.toilet) types.push("toilet");
    const cacheKey = `${types.slice().sort().join("+")}|${snapped.south.toFixed(2)},${snapped.west.toFixed(2)},${snapped.north.toFixed(2)},${snapped.east.toFixed(2)}`;
    if (fetchedBboxesRef.current.has(cacheKey)) return;
    fetchedBboxesRef.current.add(cacheKey);

    setExternalStatus("loading");
    try {
      const params = new URLSearchParams({
        bbox: `${snapped.south},${snapped.west},${snapped.north},${snapped.east}`,
        types: types.join(","),
      });
      const res = await fetch(`/api/pois?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { records: MapPoint[] };
      setExternalPoints((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const fresh = body.records.filter((p) => !seen.has(p.id));
        return fresh.length === 0 ? prev : [...prev, ...fresh];
      });
      setExternalStatus("idle");
    } catch {
      // Roll back the cache marker so a later pan can retry this region.
      fetchedBboxesRef.current.delete(cacheKey);
      setExternalStatus("error");
    }
  }, [mapReady, filters.aed, filters.toilet]);

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

  // Render markers when map is ready or visiblePoints change.
  const renderMarkers = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const maplibregl = (await import("maplibre-gl")).default;

    // Remove existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    visiblePoints.forEach((point) => {
      const el = document.createElement("div");
      el.className = "map-marker";
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        `${point.name}${point.source === "osm" ? " (OSM)" : ""}`,
      );
      // OSM-sourced markers get a hollow ring style so the user can tell at
      // a glance that they were dynamically fetched and may have less
      // verified information than the bundled Koto-official rows.
      const isOsm = point.source === "osm";
      const baseColor = point.type === "aed" ? "#dc2626" : "#2563eb";
      el.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2px solid white;
        cursor: pointer;
        background-color: ${isOsm ? "#ffffff" : baseColor};
        outline: ${isOsm ? `2px solid ${baseColor}` : "none"};
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${isOsm ? baseColor : "white"};
        font-size: 12px;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      `;
      el.textContent = point.type === "aed" ? "A" : "T";
      el.addEventListener("click", () => setSelectedPoint(point));

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [visiblePoints, mapReady]);

  useEffect(() => {
    renderMarkers();
  }, [renderMarkers]);

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

      // Centre on the user a bit further in than the default initial view so
      // the nearby radius (default 1km) fits comfortably on screen.
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

  function toggleFilter<K extends Exclude<keyof MapFilters, "radius">>(key: K) {
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

  return (
    <div className="relative w-full h-full">
      {/* Consent modal */}
      {showConsentModal && (
        <GeolocationConsent onConsent={handleConsentGrant} onDeny={handleConsentDeny} />
      )}

      {/* Map container */}
      <div ref={mapContainerRef} className="w-full h-full" aria-label="地図" />

      {/* Loading / error indicator for the dynamic OSM fetcher */}
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

      {/* Filter bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col gap-1.5 items-center max-w-xs sm:max-w-none">
        <div className="bg-white rounded-full shadow px-3 py-1.5 flex gap-2 flex-wrap justify-center">
          <FilterButton
            active={filters.aed}
            label="AED"
            color="bg-red-600"
            onClick={() => toggleFilter("aed")}
          />
          <FilterButton
            active={filters.toilet}
            label="トイレ"
            color="bg-blue-600"
            onClick={() => toggleFilter("toilet")}
          />
          <FilterButton
            active={filters.barrierFreeOnly}
            label="バリアフリー"
            color="bg-green-600"
            onClick={() => toggleFilter("barrierFreeOnly")}
          />
          <FilterButton
            active={filters.twentyFourOnly}
            label="24h"
            color="bg-orange-500"
            onClick={() => toggleFilter("twentyFourOnly")}
          />
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
            {nearbyList.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => focusPoint(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                      p.type === "aed" ? "bg-red-600" : "bg-blue-600"
                    }`}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{p.name}</span>
                    <span className="block text-xs text-gray-500">
                      {formatDistance(p.distance)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {/* Detail panel */}
      {selectedPoint && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="detail-title"
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl shadow-lg p-4 z-10 max-h-72 overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap gap-1 mb-1">
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full text-white ${
                    selectedPoint.type === "aed" ? "bg-red-600" : "bg-blue-600"
                  }`}
                >
                  {selectedPoint.type === "aed" ? "AED" : "公衆トイレ"}
                </span>
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                    selectedPoint.source === "osm"
                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                      : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  }`}
                >
                  {selectedPoint.source === "osm" ? "OSM" : "江東区公式"}
                </span>
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

          {selectedPoint.type === "aed" && (
            <>
              {selectedPoint.detail && (
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">設置場所:</span> {selectedPoint.detail}
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
              {/* Safety notice — fixed text per plan S8 */}
              <p className="mt-2 text-sm font-semibold text-red-700 bg-red-50 rounded px-3 py-2">
                緊急時は119番への通報を最優先にしてください。
              </p>
            </>
          )}

          {selectedPoint.type === "toilet" && selectedPoint.accessibility && (
            <div className="flex gap-2 mt-2 flex-wrap">
              <AccessBadge
                label="バリアフリー"
                active={selectedPoint.accessibility.barrier_free}
              />
              <AccessBadge label="24時間" active={selectedPoint.accessibility.twenty_four_hour} />
            </div>
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

function FilterButton({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ? "true" : "false"}
      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
        active
          ? `${color} text-white border-transparent`
          : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
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
