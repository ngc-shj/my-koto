"use client";

// Required for MapLibre to compute canvas dimensions and overlay positions.
// Without this stylesheet the map container collapses and nothing is drawn.
import "maplibre-gl/dist/maplibre-gl.css";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import GeolocationConsent from "@/components/GeolocationConsent";
import { KanjiText } from "@/components/Furigana";
import { MAP_INITIAL, MAP_TILE } from "@/config/map";
import MapSearch from "@/components/MapSearch";
import { haversineDistance } from "@/lib/distance";
import { displayRouteName } from "@/lib/bus/aliases";
import {
  loadGeolocationConsent,
  saveGeolocationConsent,
} from "@/lib/geolocation-consent";
import { loadBusCache, saveBusCache } from "@/lib/map/bus-cache";
import { withBasePath } from "@/lib/site/base-path";
import {
  buildStopRouteIndex,
  type StopRouteIndex,
} from "@/lib/map/bus-routes";
import { clusterByPixelBucket } from "@/lib/map/cluster";
import { filterPoints } from "@/lib/map/filter";
import { loadMapFilters, saveMapFilters } from "@/lib/map/filters-storage";
import { loadCachedPois, saveCachedPois } from "@/lib/map/poi-cache";
import { isLayerBundled } from "@/lib/map/registry";
import {
  BusToeiDataSchema,
  type BusToeiData,
} from "@/lib/opendata/schemas/bus";
import {
  HAZARD_LABELS,
  type HazardKind,
  type MapPoint,
  type MapFilters,
} from "@/lib/map/types";
import {
  LAYERS,
  OSM_ONLY_LAYER_IDS,
  getLayer,
  isLayerId,
  type LayerCategory,
  type LayerConfig,
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

// Layers grouped by category for the "カテゴリで選ぶ" expander. Module-scope
// so the grouping runs once per process — `LAYERS` is a frozen registry.
// 防災 (shelter / assembly_point / water_supply) lives on /disaster with
// its own UX, so it is excluded from /map's chip drawer to avoid sending
// visitors to two different places for the same task.
const GROUPED_LAYERS: readonly [LayerCategory, readonly LayerConfig[]][] =
  (() => {
    const m = new Map<LayerCategory, LayerConfig[]>();
    for (const l of LAYERS) {
      if (l.category === "disaster") continue;
      const list = m.get(l.category) ?? [];
      list.push(l);
      m.set(l.category, list);
    }
    return Array.from(m.entries());
  })();

const CATEGORY_LABELS: Record<LayerCategory, string> = {
  civic: "公共施設",
  disaster: "防災",
  family: "子育て・暮らし",
  transit: "交通",
  medical: "医療",
};

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
  // True when `?layers=` / `?type=` was in the URL. When true the URL is
  // authoritative and we skip the localStorage rehydration so deep links
  // don't get overwritten by the visitor's prior session.
  urlHasLayersParam?: boolean;
  // True when the deep-link `?focus=` targets a bus_stop pin. We OR
  // bus_stop=true on top of the visitor's stored filters so the focused
  // pin is visible even if their saved state had the layer off.
  focusIsBusStop?: boolean;
  // When set, the map flies to and selects the point with this id on
  // first ready.
  initialFocusId?: string | null;
};

const SOURCE_LABELS: Record<NonNullable<MapPoint["source"]>, string> = {
  "koto-official": "江東区公式",
  "tokyo-met": "東京都公式",
  osm: "OSM",
};

export default function MapClient({
  points,
  initialFilters,
  urlHasLayersParam = false,
  focusIsBusStop = false,
  initialFocusId = null,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [filters, setFilters] = useState<MapFilters>(initialFilters);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation>(null);
  // Start hidden — we either skip the modal entirely (consent already
  // recorded) or flip to true after the mount-time check below.
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Honour the previously-recorded consent: silently re-request the
  // browser geolocation when previously granted, stay silent when
  // previously denied, only show the modal on the first ever visit.
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
          // Browser-level revocation since the last visit — stay silent
          // rather than re-popping the modal mid-session.
        },
      );
    } else if (choice == null) {
      setShowConsentModal(true);
    }
  }, []);
  // The chip drawer ("カテゴリで選ぶ") is collapsed by default; the search
  // box is the primary affordance. Visitors who want to browse rather
  // than search expand the drawer once.
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  // Guards storage writes until after the initial hydration pass.
  const filtersHydratedRef = useRef(false);

  // Hydrate filters from localStorage on mount unless the URL already
  // specified `?layers=` (deep links win). When `?focus=` targets a bus
  // stop, OR bus_stop=true on top so the focused pin is visible even if
  // the visitor's saved filter had it off.
  useEffect(() => {
    // Track the layer set this hydration pass settles on so we can decide
    // whether to expand the category drawer below. Without this the
    // drawer stays collapsed even when the page renders with zero pins,
    // leaving the visitor stranded — the search box alone gives no hint
    // of how to surface layers.
    let nextLayers: MapFilters["layers"] = filters.layers;

    if (urlHasLayersParam) {
      filtersHydratedRef.current = true;
    } else {
      const stored = loadMapFilters();
      if (stored != null) {
        const next: MapFilters = {
          ...stored,
          layers: { ...stored.layers },
        };
        if (focusIsBusStop) next.layers.bus_stop = true;
        setFilters(next);
        nextLayers = next.layers;
      } else if (focusIsBusStop) {
        // No stored filters yet: still ensure the focus target's layer is
        // on, otherwise the bus pin would render off-map.
        nextLayers = { ...filters.layers, bus_stop: true };
        setFilters((prev) => ({
          ...prev,
          layers: { ...prev.layers, bus_stop: true },
        }));
      }
      filtersHydratedRef.current = true;
    }

    if (LAYERS.every((l) => !nextLayers[l.id])) {
      setCategoryDrawerOpen(true);
    }
  }, [urlHasLayersParam, focusIsBusStop]);

  useEffect(() => {
    if (!filtersHydratedRef.current) return;
    saveMapFilters(filters);
  }, [filters]);

  // Dynamic POIs fetched from /api/pois. Includes OSM-only layers (駅・
  // 病院 etc.) fetched eagerly so chip counts populate immediately.
  // Seeded from the last saved set so revisits show data instantly.
  const [externalPoints, setExternalPoints] = useState<MapPoint[]>(() => {
    const cached = loadCachedPois();
    return cached ?? [];
  });
  const [externalStatus, setExternalStatus] = useState<"idle" | "loading" | "error">("idle");
  const fetchedBboxesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (externalPoints.length === 0) return;
    saveCachedPois(externalPoints);
  }, [externalPoints]);

  // Toei bus bundle, fetched only for the stop coordinates so the
  // bus_stop layer can render pins on /map. The route picker, polyline,
  // and schedule UI all live on /bus — here we just want positions so
  // the visitor can spot where stops are while looking for something
  // else (e.g. AED near a known bus stop). IndexedDB-cached for
  // instant revisits.
  const [busData, setBusData] = useState<BusToeiData | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await loadBusCache();
      if (!cancelled && cached != null) setBusData(cached);
      try {
        const res = await fetch(withBasePath("/api/map/bus"));
        if (!res.ok) return;
        const raw: unknown = await res.json();
        const parsed = BusToeiDataSchema.safeParse(raw);
        if (!parsed.success || cancelled) return;
        setBusData(parsed.data);
        void saveBusCache(parsed.data);
      } catch {
        // Network failure — cached data (if any) keeps pins visible.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const busStopPoints = useMemo<MapPoint[]>(() => {
    if (busData == null) return [];
    return Object.values(busData.stops).map((s) => ({
      id: `bus-stop-${s.stopId}`,
      type: "bus_stop",
      source: "tokyo-met",
      name: s.name,
      address: "",
      lat: s.lat,
      lng: s.lng,
    }));
  }, [busData]);

  const busStopRouteIndex = useMemo<StopRouteIndex | null>(
    () => (busData != null ? buildStopRouteIndex(busData) : null),
    [busData],
  );

  // Bumped on map zoom/move so renderMarkers re-runs and re-clusters using
  // the current pixel projection.
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

  // Collapse the category drawer when the user starts interacting with
  // the map. The drawer's purpose is choice; once the visitor pans/zooms
  // they're done choosing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const collapse = () => setCategoryDrawerOpen(false);
    map.on("dragstart", collapse);
    return () => {
      map.off("dragstart", collapse);
    };
  }, [mapReady]);

  // Active layer ids derived once per filter change.
  const activeLayerIds = useMemo<LayerId[]>(
    () => LAYERS.filter((l) => filters.layers[l.id]).map((l) => l.id),
    [filters.layers],
  );

  // Merge bundled official points with whatever has been fetched from
  // /api/pois plus the bus_stop pins derived from the client-fetched
  // bus bundle. Dedupe by id so refreshes do not double-pin.
  const mergedPoints = useMemo(() => {
    const seen = new Set<string>();
    const out: MapPoint[] = [];
    for (const p of points) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
      }
    }
    for (const p of busStopPoints) {
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
  }, [points, busStopPoints, externalPoints]);

  const visiblePoints = useMemo(
    () => filterPoints(mergedPoints, filters, { referencePoint: userLocation }),
    [mergedPoints, filters, userLocation],
  );

  // Nearest 3 currently-visible pins from the user's location. Mirrors
  // the /disaster panel: only meaningful once location is granted and
  // the visitor has actually selected something to look for.
  const nearest = useMemo(() => {
    if (userLocation === null) return [];
    return visiblePoints
      .map((p) => ({ point: p, distance: haversineDistance(userLocation, p) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }, [visiblePoints, userLocation]);

  // Pulls POIs from /api/pois for the current viewport. The Koto-ku area is
  // covered by the bundled official datasets, so we drop OSM rows whose
  // coordinates fall inside KOTO_BBOX to avoid double-pinning the same site.
  // OSM-only layers (駅・病院 etc.) are *always* in the request set so
  // their chip counts populate even when the visitor has the layer off.
  const maybeFetchExternalPois = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

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
    const sortedTypes = Array.from(
      new Set<LayerId>([...activeLayerIds, ...OSM_ONLY_LAYER_IDS]),
    ).sort();
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
      const res = await fetch(withBasePath(`/api/pois?${params.toString()}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { records: MapPoint[] };
      setExternalPoints((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const fresh = body.records.filter((p) => {
          if (seen.has(p.id)) return false;
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

  // Toggle the detail panel on marker click — clicking the same pin twice
  // closes the panel, matching map-product conventions (Google/Apple Maps).
  const handleMarkerClick = useCallback((point: MapPoint) => {
    setSelectedPoint((prev) => (prev?.id === point.id ? null : point));
  }, []);

  // Render markers. Points that collapse into the same pixel bucket are
  // aggregated into one cluster bubble; clicking the bubble zooms in
  // until the bucket separates.
  const renderMarkers = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const maplibregl = (await import("maplibre-gl")).default;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

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
        const isSelected = selectedPoint?.id === point.id;
        const el = document.createElement("div");
        el.className = "map-marker";
        el.setAttribute("role", "button");
        el.setAttribute(
          "aria-label",
          `${point.name}${isOsm ? " (OSM)" : ""}${isSelected ? " (選択中)" : ""}`,
        );
        el.setAttribute("aria-pressed", isSelected ? "true" : "false");
        let marker: maplibregl.Marker;
        if (isSelected) {
          // Selected pin stands up — teardrop SVG anchored to its bottom
          // tip so the point of the pin sits exactly on the geographic
          // coordinate. The unselected round dot stays flat, so the
          // shape change itself is the "you picked this" signal.
          const fillColor = isOsm ? "#ffffff" : layer.color;
          const textColor = isOsm ? layer.color : "#ffffff";
          el.style.cssText = `
            cursor: pointer;
            filter: drop-shadow(0 3px 4px rgba(0,0,0,0.45));
            line-height: 0;
          `;
          el.innerHTML = `
            <svg width="34" height="46" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path
                d="M14 1 C 21 1, 26 6, 26 13 C 26 21, 14 37, 14 37 C 14 37, 2 21, 2 13 C 2 6, 7 1, 14 1 Z"
                fill="${fillColor}"
                stroke="#0f172a"
                stroke-width="2.5"
              />
              <text x="14" y="14" text-anchor="middle" dominant-baseline="middle" fill="${textColor}" font-size="11" font-weight="700" font-family="system-ui, -apple-system, sans-serif">${layer.letter}</text>
            </svg>
          `;
          el.addEventListener("click", () => handleMarkerClick(point));
          marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
            .setLngLat([point.lng, point.lat])
            .addTo(map);
        } else {
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
          el.addEventListener("click", () => handleMarkerClick(point));
          marker = new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([point.lng, point.lat])
            .addTo(map);
        }
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
          const nextZoom = Math.min(map.getZoom() + 2, map.getMaxZoom());
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
  }, [visiblePoints, mapReady, handleMarkerClick, selectedPoint]);

  useEffect(() => {
    void renderMarkers();
  }, [renderMarkers, renderTick]);

  // Re-cluster after pan/zoom settles so bucket positions reflect the
  // new projection. Debounced to coalesce rapid wheel zooms.
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

  // Render the user-location marker whenever the location is known.
  // Marker rendering is separated from the auto-flyTo below because we
  // always want the dot drawn, but only sometimes want the viewport to
  // jump to it.
  useEffect(() => {
    if (!mapReady || userLocation === null) return;
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
      userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
    })();
    return () => {
      cancelled = true;
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    };
  }, [userLocation, mapReady]);

  // Auto-center on the visitor's location once on first grant — but
  // only when nothing else is competing for the viewport. A `?focus=`
  // deep link or a clicked pin both win, so a visitor who landed on a
  // bus stop in another ward sees their target, not their own house.
  const autoFlyDoneRef = useRef(false);
  useEffect(() => {
    if (autoFlyDoneRef.current) return;
    if (!mapReady || userLocation === null) return;
    if (initialFocusId != null || selectedPoint != null) return;
    mapRef.current?.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 15,
    });
    autoFlyDoneRef.current = true;
  }, [userLocation, mapReady, initialFocusId, selectedPoint]);

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

  // Floating "現在地" button — flies the viewport to the visitor's
  // location, requesting it from scratch if not yet known. A previously
  // denied app-level choice gets promoted to "granted" when the visitor
  // taps the button (it's an explicit re-consent gesture).
  function handleLocateMe() {
    if (userLocation != null) {
      mapRef.current?.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 15,
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
          zoom: 15,
        });
      },
      () => {
        // Browser-level deny — surface a hint rather than failing silent.
        window.alert(
          "現在地を取得できませんでした。ブラウザの位置情報設定を確認してください。",
        );
      },
    );
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

  const focusPoint = useCallback((point: MapPoint) => {
    setSelectedPoint(point);
    mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 17 });
    // Collapse the category drawer — the visitor just picked a target,
    // so the chip picker has done its job and would only block the map.
    setCategoryDrawerOpen(false);
    // Auto-enable the picked point's layer so its marker actually
    // renders. Without this, a search hit on a currently-off category
    // would fly the map to an empty-looking spot — the detail panel
    // would open but no pin would mark the location.
    if (isLayerId(point.type)) {
      setFilters((prev) => {
        if (prev.layers[point.type] === true) return prev;
        return {
          ...prev,
          layers: { ...prev.layers, [point.type]: true },
        };
      });
    }
  }, []);

  // Handle ?focus=<id> deep links exactly once per id. We search
  // `mergedPoints` (not just SSR `points`) so bus-stop deep links
  // resolve once busData arrives — the ref guards against repeated
  // firings as mergedPoints is rebuilt during POI fetches. Reset the
  // ref whenever the focus target id itself changes so soft-navigation
  // between two `?focus=` URLs (e.g. /map?focus=A → /map?focus=B) still
  // applies the second focus instead of bailing on a stale ref.
  const focusAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialFocusId == null) return;
    if (focusAppliedRef.current === initialFocusId) return;
    if (!mapReady) return;
    const target = mergedPoints.find((p) => p.id === initialFocusId);
    if (target == null) return;
    focusAppliedRef.current = initialFocusId;
    focusPoint(target);
  }, [mapReady, initialFocusId, mergedPoints, focusPoint]);

  const googleMapsUrl = selectedPoint
    ? `https://www.google.com/maps?q=${selectedPoint.lat},${selectedPoint.lng}`
    : null;

  // Per-layer point counts derived from the merged catalog. OSM-only
  // layers populate as soon as the viewport fetch returns.
  const pointCountByLayer = useMemo(() => {
    const counts = new Map<LayerId, number>();
    for (const p of mergedPoints) {
      if (!isLayerId(p.type)) continue;
      counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    }
    return counts;
  }, [mergedPoints]);

  const activeLayerCount = activeLayerIds.length;

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

      {/* External-data status pill (top-right, only when non-idle) */}
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

      {/* Primary control: search box + collapsible category drawer */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col gap-1.5 w-[min(95vw,28rem)]">
        <div className="bg-white rounded-xl shadow border border-slate-200 p-3 space-y-2">
          <MapSearch points={mergedPoints} onPick={focusPoint} />
          <button
            type="button"
            onClick={() => setCategoryDrawerOpen((v) => !v)}
            // eslint-disable-next-line jsx-a11y/aria-proptypes
            aria-expanded={categoryDrawerOpen ? "true" : "false"}
            className="w-full flex items-center justify-between gap-2 text-xs text-slate-600 hover:text-slate-900"
          >
            <span>
              <KanjiText text="カテゴリで選ぶ" />
            </span>
            <span className="text-slate-500">
              {activeLayerCount > 0 ? `${activeLayerCount} 件 ON` : ""}{" "}
              <span aria-hidden="true">{categoryDrawerOpen ? "▲" : "▼"}</span>
            </span>
          </button>
          {categoryDrawerOpen && (
            <div className="space-y-3 border-t border-slate-100 pt-2 max-h-[60vh] overflow-y-auto">
              {GROUPED_LAYERS.map(([category, layers]) => (
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

        {/* Nearest 3 — surfaces only when location is known and the
            visitor has actually selected at least one category. Hidden
            while the detail panel is up so the bottom-sheet doesn't
            fight this card for vertical space. */}
        {userLocation !== null &&
          activeLayerCount > 0 &&
          nearest.length > 0 &&
          selectedPoint === null && (
            <aside
              aria-label="現在地から最も近い 3 件"
              className="bg-white rounded-xl shadow border border-slate-200"
            >
              <header className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-700">
                <KanjiText text="現在地から近い順" />
              </header>
              <ul className="divide-y divide-slate-100">
                {nearest.map(({ point: p, distance }) => {
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
                            {distance < 1000
                              ? `${Math.round(distance)} m`
                              : `${(distance / 1000).toFixed(1)} km`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>
          )}
      </div>

      {/* Floating "現在地へ" button (bottom-right). Hidden while the
          detail panel is open so the two don't share the same corner. */}
      {!selectedPoint && (
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

          {selectedPoint.type === "bus_stop" && busStopRouteIndex != null && (
            <BusStopRoutesList
              stopId={selectedPoint.id.replace(/^bus-stop-/, "")}
              index={busStopRouteIndex}
            />
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
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${layer.label} (${count} 件)`}
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
      <span
        aria-hidden="true"
        className="ml-0.5 text-[10px] tabular-nums opacity-80"
      >
        {count >= 1000 ? `${Math.floor(count / 100) / 10}k` : count}
      </span>
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

// Routes serving the currently-selected bus stop. Each entry links into
// the dedicated /bus page with the matching direction pre-selected, so
// /map stays out of the route/schedule UX it doesn't own.
function BusStopRoutesList({
  stopId,
  index,
}: {
  stopId: string;
  index: StopRouteIndex;
}) {
  const serving = index[stopId];
  if (serving == null || serving.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-slate-600 mb-1">
        <KanjiText
          text={`この停留所を通る系統 (${serving.length} 件)`}
        />
      </p>
      <p className="text-xs text-slate-500 mb-2">
        <KanjiText text="選ぶとバス時刻表へ移動します" />
      </p>
      <ul className="grid grid-cols-1 gap-1">
        {serving.map((s) => (
          <li key={`${s.routeId}-${s.directionId}`}>
            <Link
              href={`/bus/${encodeURIComponent(s.routeId)}/${encodeURIComponent(stopId)}?dir=${s.directionId}&from=map`}
              className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded border bg-white text-slate-700 border-slate-200 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span
                aria-hidden="true"
                className="inline-block w-3 h-2 rounded-sm flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="font-medium tabular-nums">
                {displayRouteName(s.shortName)}
              </span>
              <span className="text-xs text-slate-500 truncate">
                <KanjiText text={`${s.headsign} 方面`} />
              </span>
              <span className="ml-auto text-xs text-blue-600" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
