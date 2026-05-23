"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MaplibreMap } from "maplibre-gl";
import { MAP_TILE } from "@/config/map";

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
  // Polyline along the road network. Empty when shapes.txt was missing
  // upstream — we fall back to stop-connected lines in that case.
  readonly shape: ReadonlyArray<readonly [number, number]>;
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
  const [mapReady, setMapReady] = useState(false);

  const geojson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: directions
        .filter((d) => d.shape.length >= 2)
        .map((d) => ({
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: d.shape.map(([lng, lat]) => [lng, lat] as const),
          },
          properties: {
            directionId: d.directionId,
            color: d.color,
          },
        })),
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

      // Dedupe by stopId — both directions usually share most stops, and
      // doubling up clutters the map.
      const seen = new Set<string>();
      for (const d of directions) {
        if (activeDirection !== "all" && d.directionId !== activeDirection) {
          continue;
        }
        for (const s of d.stops) {
          if (seen.has(s.stopId)) continue;
          seen.add(s.stopId);
          const isHighlight = s.stopId === highlightStopId;
          const el = document.createElement("div");
          el.setAttribute("role", "img");
          el.setAttribute("aria-label", s.name);
          const size = isHighlight ? 16 : 10;
          el.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            border: 2px solid white;
            background-color: ${isHighlight ? "#dc2626" : d.color};
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          `;
          el.title = s.name;
          const marker = new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([s.lng, s.lat])
            .addTo(map);
          markersRef.current.push(marker);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [directions, activeDirection, mapReady, highlightStopId]);

  return (
    <figure
      className="rounded-lg border border-slate-200 overflow-hidden bg-white"
      aria-label={`${routeName} の路線図`}
    >
      <div
        ref={containerRef}
        className="w-full h-[280px] sm:h-[360px]"
        role="application"
      />
    </figure>
  );
}
