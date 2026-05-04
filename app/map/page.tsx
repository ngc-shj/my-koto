import type { Metadata } from "next";
import {
  parseAedData,
  parseAssemblyPointData,
  parseKotoFacilityData,
  parseShelterData,
  parseToiletData,
  parseWaterSupplyData,
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
import ShareButton from "@/components/ShareButton";
import aedRaw from "@/data/aed.json";
import toiletRaw from "@/data/toilet.json";
import shelterRaw from "@/data/shelter.json";
import assemblyPointRaw from "@/data/assembly_point.json";
import waterSupplyRaw from "@/data/water_supply.json";
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

// `?layers=aed,toilet` (legacy `?type=aed,toilet` also accepted) controls
// which layers start enabled. When the parameter is omitted the previous
// AED + toilet defaults are preserved so existing bookmarks keep working.
type SearchParams = { layers?: string; type?: string };

const DEFAULT_LAYERS: readonly LayerId[] = ["aed", "toilet"];

function parseLayersParam(raw: string | undefined): LayerId[] {
  if (!raw) return [...DEFAULT_LAYERS];
  const out: LayerId[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (isLayerId(t) && !out.includes(t)) out.push(t);
  }
  return out.length === 0 ? [...DEFAULT_LAYERS] : out;
}

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeTypes = parseLayersParam(params.layers ?? params.type);

  const allPoints = [
    ...parseAedData(aedRaw),
    ...parseToiletData(toiletRaw),
    ...parseShelterData(shelterRaw),
    ...parseAssemblyPointData(assemblyPointRaw),
    ...parseWaterSupplyData(waterSupplyRaw),
    ...parseKotoFacilityData("park", parkRaw),
    ...parseKotoFacilityData("library", libraryRaw),
    ...parseKotoFacilityData("child_center", childCenterRaw),
    ...parseKotoFacilityData("nursery", nurseryRaw),
  ];

  const layers: Partial<Record<LayerId, boolean>> = {};
  for (const id of LAYER_IDS) {
    layers[id] = activeTypes.includes(id);
  }
  const initialFilters: MapFilters = {
    layers,
    barrierFreeOnly: false,
    twentyFourOnly: false,
    radius: 1000,
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <BackToHome />
            <h1 className="text-lg font-semibold text-slate-700">区民マップ</h1>
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
        <MapClient points={allPoints} initialFilters={initialFilters} />
      </div>
    </div>
  );
}
