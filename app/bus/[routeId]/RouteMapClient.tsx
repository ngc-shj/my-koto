"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MaplibreMap } from "maplibre-gl";
import { MAP_TILE } from "@/config/map";
import {
  loadGeolocationConsent,
  saveGeolocationConsent,
} from "@/lib/geolocation-consent";

type Stop = {
  readonly stopId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
};

type DirectionView = {
  readonly directionId: "0" | "1";
  readonly headsign: string;
  readonly color: string;
  // Polylines along the road network. A direction usually has several
  // variants (terminal branches, detours); we render every one so the
  // line never has gaps where a variant runs. Empty when shapes.txt
  // was missing upstream entirely.
  readonly shapes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  readonly stops: ReadonlyArray<Stop>;
};

export type ActiveDirection = "all" | "0" | "1";

type Props = {
  routeName: string;
  directions: ReadonlyArray<DirectionView>;
  // Controlled by the parent so a single state value drives both the
  // map and the stop list filter. Default "all" when omitted.
  activeDirection?: ActiveDirection;
  // When set, this stopId pin renders larger so the visitor jumping in
  // from /bus/[routeId]/[stopId] sees their stop right away.
  highlightStopId?: string;
};

const PALE_STYLE = {
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
  layers: [{ id: "gsi-tiles", type: "raster" as const, source: "gsi" }],
};

// Computes a bbox padded slightly so the route doesn't kiss the edge.
function fitBoundsFor(
  directions: ReadonlyArray<DirectionView>,
): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const d of directions) {
    for (const s of d.stops) {
      if (s.lng < minLng) minLng = s.lng;
      if (s.lng > maxLng) maxLng = s.lng;
      if (s.lat < minLat) minLat = s.lat;
      if (s.lat > maxLat) maxLat = s.lat;
    }
  }
  if (!Number.isFinite(minLng) || !Number.isFinite(maxLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export default function RouteMapClient({
  routeName,
  directions,
  activeDirection = "all",
  highlightStopId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState<
    { lat: number; lng: number } | null
  >(null);

  const geojson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      // Flatten each direction's shape variants into separate
      // LineString features so all branches (terminals, detours) are
      // drawn — a single canonical shape would leave visible gaps for
      // routes like 亀29 that fan out at the ends.
      features: directions.flatMap((d) =>
        d.shapes
          .filter((s) => s.length >= 2)
          .map((s) => ({
            type: "Feature" as const,
            geometry: {
              type: "LineString" as const,
              coordinates: s.map(([lng, lat]) => [lng, lat] as const),
            },
            properties: {
              directionId: d.directionId,
              color: d.color,
            },
          })),
      ),
    };
  }, [directions]);

  // Init the map once.
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;

      const bounds = fitBoundsFor(directions);
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: PALE_STYLE,
        // Center on Koto-ku — the bounds fit below will overwrite this
        // once the data loads, so the seed value just guarantees a
        // sensible first frame.
        center: [139.8175, 35.6727],
        zoom: 12,
        maxZoom: 18,
        minZoom: 9,
        attributionControl: {},
      });
      mapRef.current = map;
      map.on("load", () => {
        if (cancelled) return;
        if (bounds != null) {
          map.fitBounds(bounds, { padding: 32, animate: false });
        }
        setMapReady(true);
      });
    }

    initMap();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [directions]);

  // (Re-)attach the route polylines as a single GeoJSON source/layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource("route-lines") as GeoJSONSource | undefined;
    if (src != null) {
      src.setData(geojson as unknown as GeoJSON.FeatureCollection);
    } else {
      map.addSource("route-lines", {
        type: "geojson",
        data: geojson as unknown as GeoJSON.FeatureCollection,
      });
      map.addLayer({
        id: "route-lines-layer",
        type: "line",
        source: "route-lines",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            2,
            14,
            4,
            17,
            7,
          ],
          "line-opacity": 0.75,
        },
      });
    }
  }, [geojson, mapReady]);

  // Visibility filter for the direction picker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getLayer("route-lines-layer")) return;
    if (activeDirection === "all") {
      map.setFilter("route-lines-layer", null);
    } else {
      map.setFilter("route-lines-layer", [
        "==",
        ["get", "directionId"],
        activeDirection,
      ]);
    }
  }, [activeDirection, mapReady]);

  // Pan to the highlighted stop. Without this the visitor only sees a
  // red dot somewhere on the polyline — long routes leave that dot
  // off-screen, defeating the purpose of the "地図" button on the stop
  // list. Zoom is left untouched: the visitor's existing zoom level
  // (whether they pinched in to compare stops or stayed at the bbox
  // overview) is preserved across taps.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || highlightStopId == null) return;
    for (const d of directions) {
      const stop = d.stops.find((s) => s.stopId === highlightStopId);
      if (stop != null) {
        map.flyTo({ center: [stop.lng, stop.lat] });
        return;
      }
    }
  }, [highlightStopId, directions, mapReady]);

  // Stop pins. Re-render on direction change or highlight change so the
  // visible set matches the polylines.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) return;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const addStopMarker = (
        s: Stop,
        directionColor: string,
        isHighlight: boolean,
      ) => {
        const el = document.createElement("div");
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", s.name);
        const size = isHighlight ? 16 : 10;
        el.style.cssText = `
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          border: 2px solid white;
          background-color: ${isHighlight ? "#dc2626" : directionColor};
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        `;
        el.title = s.name;
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([s.lng, s.lat])
          .addTo(map);
        markersRef.current.push(marker);
      };

      // Dedupe by stopId — both directions usually share most stops, and
      // doubling up clutters the map. The highlighted stop is deferred
      // to a final pass so MapLibre's DOM-order stacking places it on
      // top of any neighbouring pins that would otherwise overlap it.
      const seen = new Set<string>();
      let highlightHit: { stop: Stop; color: string } | null = null;
      for (const d of directions) {
        if (activeDirection !== "all" && d.directionId !== activeDirection) {
          continue;
        }
        for (const s of d.stops) {
          if (seen.has(s.stopId)) continue;
          seen.add(s.stopId);
          if (s.stopId === highlightStopId) {
            highlightHit = { stop: s, color: d.color };
            continue;
          }
          addStopMarker(s, d.color, false);
        }
      }
      if (highlightHit != null) {
        addStopMarker(highlightHit.stop, highlightHit.color, true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [directions, activeDirection, mapReady, highlightStopId]);

  // Silently re-acquire the visitor's location when consent was already
  // granted on a previous visit (typically via /map). First-time visitors
  // see no prompt until they tap the floating button below.
  useEffect(() => {
    if (loadGeolocationConsent() !== "granted") return;
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        // Browser-level revocation since the last visit — stay silent.
      },
    );
  }, []);

  // Render / refresh the user-location dot. Matches the /map pin style
  // so the same marker means the same thing across the app.
  useEffect(() => {
    if (!mapReady || userLocation == null) return;
    let cancelled = false;
    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      const map = mapRef.current;
      if (cancelled || !map) return;
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
      userMarkerRef.current = new maplibregl.Marker({
        element: el,
        anchor: "center",
      })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
    })();
    return () => {
      cancelled = true;
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    };
  }, [userLocation, mapReady]);

  // Floating "現在地へ" button handler. Pans only — zoom is preserved so
  // the visitor's current overview of the route doesn't get hijacked. A
  // first-time tap acts as an explicit consent gesture (browser native
  // prompt → on grant we record the choice for future visits).
  function handleLocateMe() {
    if (userLocation != null) {
      mapRef.current?.flyTo({
        center: [userLocation.lng, userLocation.lat],
      });
      return;
    }
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        saveGeolocationConsent("granted");
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        mapRef.current?.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
        });
      },
      () => {
        window.alert(
          "現在地を取得できませんでした。ブラウザの位置情報設定を確認してください。",
        );
      },
    );
  }

  return (
    <figure
      className="relative rounded-lg border border-slate-200 overflow-hidden bg-white"
      aria-label={`${routeName} の路線図`}
    >
      <div
        ref={containerRef}
        className="w-full h-[280px] sm:h-[360px]"
        role="application"
      />
      <button
        type="button"
        onClick={handleLocateMe}
        aria-label="現在地へ移動"
        className="absolute bottom-3 right-3 z-10 w-11 h-11 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
        </svg>
      </button>
    </figure>
  );
}
