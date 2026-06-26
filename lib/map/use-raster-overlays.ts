import { useEffect, type RefObject } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  HAZARD_OVERLAYS,
  type HazardOverlay,
  type HazardOverlayId,
} from "@/config/hazard-tiles";
import { buildKikukuruTileUrl, fetchKikukuruFrame } from "@/lib/jma/kikukuru";

// MapLibre ids for the raster source/layer of one overlay. Kept stable and
// derived from the overlay id so toggle/visibility lookups never drift.
function sourceId(id: HazardOverlayId): string {
  return `hazard-src-${id}`;
}
function layerId(id: HazardOverlayId): string {
  return `hazard-layer-${id}`;
}

// Resolve the tile URL template for an overlay. MLIT overlays carry a static
// template; キキクル overlays need the basetime frame fetched at runtime.
async function resolveTiles(
  overlay: HazardOverlay,
  signal: AbortSignal,
): Promise<string | null> {
  if (overlay.urlTemplate != null) return overlay.urlTemplate;
  if (overlay.element != null) {
    const frame = await fetchKikukuruFrame(signal);
    if (frame == null) return null;
    return buildKikukuruTileUrl(frame, overlay.element);
  }
  return null;
}

function addOverlayLayer(
  map: MaplibreMap,
  overlay: HazardOverlay,
  tiles: string,
): void {
  if (map.getSource(sourceId(overlay.id)) != null) return;
  map.addSource(sourceId(overlay.id), {
    type: "raster",
    tiles: [tiles],
    tileSize: overlay.tileSize,
    maxzoom: overlay.maxNativeZoom,
    minzoom: overlay.minNativeZoom,
    attribution: overlay.attribution,
  });
  // Added on first activation only, so layout visibility starts "visible".
  // The source sits above the basemap; DOM Markers always render in front of
  // canvas raster layers, so no beforeId juggling is needed.
  map.addLayer({
    id: layerId(overlay.id),
    type: "raster",
    source: sourceId(overlay.id),
    paint: { "raster-opacity": overlay.opacity },
  });
}

// Attach hazard raster overlays to a MapLibre map and toggle their
// visibility from the active set. Shared by /map and /disaster so the two
// pages don't reimplement raster source/layer wiring.
//
// Layers are created lazily on first activation (キキクル needs an async
// basetime resolution we don't want to pay on page load), then flipped with
// setLayoutProperty("visibility") — cheaper than add/remove and it keeps the
// resolved キキクル frame cached for the session.
export function useRasterOverlays(
  mapRef: RefObject<MaplibreMap | null>,
  mapReady: boolean,
  activeOverlayIds: ReadonlySet<HazardOverlayId>,
): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const controller = new AbortController();

    void (async () => {
      for (const overlay of HAZARD_OVERLAYS) {
        const active = activeOverlayIds.has(overlay.id);
        const existing = map.getLayer(layerId(overlay.id));

        if (active && existing == null) {
          const tiles = await resolveTiles(overlay, controller.signal);
          if (controller.signal.aborted) return;
          if (tiles == null) continue; // resolution failed — skip silently
          addOverlayLayer(map, overlay, tiles);
        } else if (existing != null) {
          map.setLayoutProperty(
            layerId(overlay.id),
            "visibility",
            active ? "visible" : "none",
          );
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [mapRef, mapReady, activeOverlayIds]);
}
