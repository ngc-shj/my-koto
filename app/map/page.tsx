import type { Metadata } from "next";
import {
  parseAedData,
  parseKotoFacilityData,
  parseToiletData,
} from "@/lib/map/validate";
import {
  LAYER_IDS,
  isLayerId,
  type LayerId,
} from "@/lib/map/registry";
import type { MapFilters } from "@/lib/map/types";
import { MAP_TILE } from "@/config/map";
import MapClient from "./MapClient";
import BackToHome from "@/components/BackToHome";
import { KanjiText } from "@/components/Furigana";
import ShareButton from "@/components/ShareButton";
import aedRaw from "@/data/aed.json";
import toiletRaw from "@/data/toilet.json";
import parkRaw from "@/data/park.json";
import libraryRaw from "@/data/library.json";
import childCenterRaw from "@/data/child_center.json";
import nurseryRaw from "@/data/nursery.json";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const metadata: Metadata = {
  title: "区民マップ (AED・トイレ・防災) | My こうとう (非公式)",
  description:
    "江東区内の AED・公衆トイレ・避難所・避難場所・給水拠点を地図で確認できます。",
};

// `?layers=aed,toilet` (legacy `?type=aed,toilet` also accepted) narrows the
// visible layers to a specific subset. When the parameter is omitted all
// layers start OFF so first-time visitors aren't flooded with pins; the
// client rehydrates the user's previous selection from localStorage if
// any. Explicit URLs always win over the saved selection.
type SearchParams = {
  layers?: string;
  type?: string;
  focus?: string;
};

function parseLayersParam(raw: string | undefined): LayerId[] {
  if (!raw) return [];
  const out: LayerId[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (isLayerId(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const layersParam = params.layers ?? params.type;
  const urlHasLayersParam =
    typeof layersParam === "string" && layersParam.trim().length > 0;
  const activeTypes = parseLayersParam(layersParam);
  const initialFocusId = typeof params.focus === "string" ? params.focus : null;

  // Bus and 防災 (shelter/avoidance/water) have moved to /bus and
  // /disaster respectively. The map is a search-first facility finder
  // for the everyday categories — AED / toilet / park / library /
  // children's facilities / nursery, plus OSM-only layers fetched
  // dynamically (station / hospital / clinic / pharmacy).
  const allPoints = [
    ...parseAedData(aedRaw),
    ...parseToiletData(toiletRaw),
    ...parseKotoFacilityData("park", parkRaw),
    ...parseKotoFacilityData("library", libraryRaw),
    ...parseKotoFacilityData("child_center", childCenterRaw),
    ...parseKotoFacilityData("nursery", nurseryRaw),
  ];

  // Auto-enable bus_stop when a deep link focuses one, so the focused
  // pin renders even on a fresh visitor (no localStorage yet) — without
  // this the visitor sees the detail panel referenced from elsewhere
  // but no pin on the map.
  const focusIsBusStop =
    initialFocusId != null && initialFocusId.startsWith("bus-stop-");

  const layers: Partial<Record<LayerId, boolean>> = {};
  for (const id of LAYER_IDS) {
    layers[id] = activeTypes.includes(id) || (id === "bus_stop" && focusIsBusStop);
  }
  const initialFilters: MapFilters = {
    layers,
    barrierFreeOnly: false,
    twentyFourOnly: false,
    // Radius UI removed — keep the field so MapFilters stays compatible,
    // null means "no distance filter".
    radius: null,
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <BackToHome />
            <h1 className="text-lg font-semibold text-slate-700">
              <KanjiText text="区民マップ" />
            </h1>
          </div>
          <ShareButton title="区民マップ" url={`${SITE_URL}/map`} />
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          地図:{" "}
          <a
            href={MAP_TILE.attributionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-700"
          >
            {MAP_TILE.attribution}
          </a>
          {" / "}施設データ: 江東区・東京都 (CC-BY 4.0) +{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-700"
          >
            © OpenStreetMap contributors
          </a>{" "}
          (ODbL)
        </p>
      </header>
      <div className="flex-1 overflow-hidden">
        <MapClient
          points={allPoints}
          initialFilters={initialFilters}
          urlHasLayersParam={urlHasLayersParam}
          focusIsBusStop={focusIsBusStop}
          initialFocusId={initialFocusId}
        />
      </div>
    </div>
  );
}
