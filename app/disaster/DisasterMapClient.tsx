"use client";

// Required for MapLibre to compute canvas dimensions.
import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { KanjiText } from "@/components/Furigana";
import GeolocationConsent from "@/components/GeolocationConsent";
import { MAP_INITIAL, TILE_STYLES } from "@/config/map";
import { haversineDistance } from "@/lib/distance";
import { loadGeolocationConsent } from "@/lib/geolocation-consent";
import { getLayer, isLayerId } from "@/lib/map/registry";
import {
  HAZARD_LABELS,
  type HazardKind,
  type MapPoint,
} from "@/lib/map/types";

// 淡色地図: needs road context for navigation in an actual emergency —
// the blank style hides street layout entirely and a stressed visitor
// can't orient. Keep the basemap quiet (no labels/POIs) but visible.
const PALE_STYLE = {
  version: 8 as const,
  sources: {
    gsi: {
      type: "raster" as const,
      tiles: [TILE_STYLES.pale.url],
      tileSize: TILE_STYLES.pale.tileSize,
      maxzoom: TILE_STYLES.pale.maxNativeZoom,
      minzoom: TILE_STYLES.pale.minNativeZoom,
      attribution: TILE_STYLES.pale.attribution,
    },
  },
  layers: [{ id: "gsi-tiles", type: "raster" as const, source: "gsi" }],
};

type UserLocation = { lat: number; lng: number } | null;

type Props = {
  points: MapPoint[];
};

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function DisasterMapClient({ points }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation>(null);
  // Start hidden — flipped to true only on the first ever visit
  // (no recorded consent yet); previously-granted sessions skip the
  // modal and request location silently.
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const choice = loadGeolocationConsent();
    if (choice === "granted") {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          // Browser-level revocation — stay silent.
        },
      );
    } else if (choice == null) {
      setShowConsentModal(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initMap() {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !mapContainerRef.current) return;
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: PALE_STYLE,
        center: MAP_INITIAL.center,
        zoom: MAP_INITIAL.zoom,
        maxZoom: MAP_INITIAL.maxZoom,
        minZoom: MAP_INITIAL.minZoom,
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

  // Render pins. No clustering — disaster sites are sparse enough that
  // individual pins read better than buckets, and visibility matters
  // more than density here.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) return;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      for (const point of points) {
        if (!isLayerId(point.type)) continue;
        const layer = getLayer(point.type);
        const isSelected = selectedPoint?.id === point.id;
        const el = document.createElement("div");
        el.setAttribute("role", "button");
        el.setAttribute(
          "aria-label",
          `${point.name}${isSelected ? " (選択中)" : ""}`,
        );
        el.setAttribute("aria-pressed", isSelected ? "true" : "false");
        let marker: maplibregl.Marker;
        if (isSelected) {
          // Selected pin stands up — same teardrop-with-tip pattern as
          // /map so the visual language stays consistent across the
          // two map pages.
          el.style.cssText = `
            cursor: pointer;
            filter: drop-shadow(0 3px 4px rgba(0,0,0,0.45));
            line-height: 0;
          `;
          el.innerHTML = `
            <svg width="34" height="46" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path
                d="M14 1 C 21 1, 26 6, 26 13 C 26 21, 14 37, 14 37 C 14 37, 2 21, 2 13 C 2 6, 7 1, 14 1 Z"
                fill="${layer.color}"
                stroke="#0f172a"
                stroke-width="2.5"
              />
              <text x="14" y="14" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-size="11" font-weight="700" font-family="system-ui, -apple-system, sans-serif">${layer.letter}</text>
            </svg>
          `;
          el.addEventListener("click", () => {
            setSelectedPoint((prev) => (prev?.id === point.id ? null : point));
          });
          marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
            .setLngLat([point.lng, point.lat])
            .addTo(map);
        } else {
          el.style.cssText = `
            width: 26px;
            height: 26px;
            border-radius: 50%;
            border: 2px solid white;
            cursor: pointer;
            background-color: ${layer.color};
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          `;
          el.textContent = layer.letter;
          el.addEventListener("click", () => {
            setSelectedPoint((prev) => (prev?.id === point.id ? null : point));
          });
          marker = new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([point.lng, point.lat])
            .addTo(map);
        }
        markersRef.current.push(marker);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [points, mapReady, selectedPoint]);

  // User location marker + auto-fly on grant.
  useEffect(() => {
    if (!mapReady || userLocation === null) return;
    void (async () => {
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
    })();
    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    };
  }, [userLocation, mapReady]);

  // Nearest 3 — disaster context, surface this prominently so the
  // visitor sees where to go before they have to think about it.
  const nearest = useMemo(() => {
    if (userLocation === null) return [];
    return points
      .map((p) => ({ ...p, distance: haversineDistance(userLocation, p) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }, [points, userLocation]);

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

  function focusPoint(point: MapPoint) {
    setSelectedPoint(point);
    mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 17 });
  }

  const selectedLayer =
    selectedPoint && isLayerId(selectedPoint.type)
      ? getLayer(selectedPoint.type)
      : null;
  const selectedHazards = selectedPoint?.hazards
    ? (Object.entries(selectedPoint.hazards) as [HazardKind, boolean][])
        .filter(([, v]) => v)
        .map(([k]) => k)
    : [];

  const googleMapsUrl = selectedPoint
    ? `https://www.google.com/maps?q=${selectedPoint.lat},${selectedPoint.lng}`
    : null;

  return (
    <div className="relative w-full h-full">
      {showConsentModal && (
        <GeolocationConsent
          onConsent={handleConsentGrant}
          onDeny={handleConsentDeny}
        />
      )}

      <div ref={mapContainerRef} className="w-full h-full" aria-label="防災地図" />

      {/* Nearest-3 panel — only when location is available */}
      {userLocation !== null && nearest.length > 0 && !selectedPoint && (
        <aside
          aria-label="現在地から最も近い 3 件"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-[min(95vw,28rem)] bg-white rounded-xl shadow border border-slate-200"
        >
          <header className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-700">
            <KanjiText text="現在地から近い順" />
          </header>
          <ul className="divide-y divide-slate-100">
            {nearest.map((p) => {
              const layer = isLayerId(p.type) ? getLayer(p.type) : null;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => focusPoint(p)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: layer?.color ?? "#64748b" }}
                    >
                      {layer?.letter ?? "?"}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-slate-800">
                        <KanjiText text={p.name} />
                      </span>
                      <span className="block text-xs text-slate-500">
                        {layer?.label ?? p.type} ·{" "}
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
          aria-labelledby="disaster-detail-title"
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
              </div>
              <h2 id="disaster-detail-title" className="text-base font-semibold">
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

          {selectedPoint.address && (
            <p className="text-sm text-gray-600 mt-1">{selectedPoint.address}</p>
          )}
          {selectedPoint.detail && (
            <p className="text-sm text-gray-600 mt-2">
              <span className="font-medium">詳細:</span> {selectedPoint.detail}
            </p>
          )}
          {selectedPoint.facilityType && (
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-medium">区分:</span>{" "}
              {selectedPoint.facilityType}
            </p>
          )}

          {selectedHazards.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-600 mb-1">
                <KanjiText text="対応災害種別" />
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
