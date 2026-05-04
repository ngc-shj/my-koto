"use client";

// Required for MapLibre to compute canvas dimensions and overlay positions.
// Without this stylesheet the map container collapses and nothing is drawn.
import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import GeolocationConsent from "@/components/GeolocationConsent";
import { MAP_INITIAL, MAP_TILE } from "@/config/map";
import { filterPoints } from "@/lib/map/filter";
import { haversineDistance } from "@/lib/distance";
import type { MapPoint, MapFilters } from "@/lib/map/types";

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

  // Render markers when map is ready or filters/location change
  const renderMarkers = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const maplibregl = (await import("maplibre-gl")).default;

    // Remove existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const filtered = filterPoints(points, filters);

    // Sort by distance from user location if available
    const sorted =
      userLocation !== null
        ? [...filtered].sort(
            (a, b) =>
              haversineDistance(userLocation, a) - haversineDistance(userLocation, b)
          )
        : filtered;

    sorted.forEach((point) => {
      const el = document.createElement("div");
      el.className = "map-marker";
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", point.name);
      el.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2px solid white;
        cursor: pointer;
        background-color: ${point.type === "aed" ? "#dc2626" : "#2563eb"};
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 12px;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      `;
      el.textContent = point.type === "aed" ? "A" : "T";
      el.addEventListener("click", () => setSelectedPoint(point));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [points, filters, userLocation, mapReady]);

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
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);

      map.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14 });
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

  function toggleFilter<K extends keyof MapFilters>(key: K) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
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

      {/* Filter bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white rounded-full shadow px-3 py-1.5 flex gap-2 flex-wrap justify-center max-w-xs sm:max-w-none">
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
              <span
                className={`inline-block text-xs px-2 py-0.5 rounded-full text-white mb-1 ${
                  selectedPoint.type === "aed" ? "bg-red-600" : "bg-blue-600"
                }`}
              >
                {selectedPoint.type === "aed" ? "AED" : "公衆トイレ"}
              </span>
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

          <p className="text-sm text-gray-600 mt-1">{selectedPoint.address}</p>

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
