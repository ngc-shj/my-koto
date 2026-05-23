import type { Metadata } from "next";
import BackToHome from "@/components/BackToHome";
import { KanjiText } from "@/components/Furigana";
import JmaWarningPanel from "@/components/JmaWarningPanel";
import ShareButton from "@/components/ShareButton";
import {
  parseAssemblyPointData,
  parseShelterData,
  parseWaterSupplyData,
} from "@/lib/map/validate";
import { MAP_TILE } from "@/config/map";
import shelterRaw from "@/data/shelter.json";
import assemblyPointRaw from "@/data/assembly_point.json";
import waterSupplyRaw from "@/data/water_supply.json";
import DisasterMapClient from "./DisasterMapClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const metadata: Metadata = {
  title: "防災マップ (避難所・避難場所・給水) | My こうとう (非公式)",
  description:
    "江東区の避難所・避難場所・給水拠点と、現在発表されている気象警報をひとつのページで確認できます。",
};

export default function DisasterPage() {
  const points = [
    ...parseShelterData(shelterRaw),
    ...parseAssemblyPointData(assemblyPointRaw),
    ...parseWaterSupplyData(waterSupplyRaw),
  ];

  return (
    <div className="flex flex-col h-screen">
      <header className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <BackToHome />
            <h1 className="text-lg font-semibold text-slate-700">
              <KanjiText text="防災マップ" />
            </h1>
          </div>
          <ShareButton title="防災マップ" url={`${SITE_URL}/disaster`} />
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          地図:{" "}
          <a
            href={MAP_TILE.attributionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-700"
          >
            地理院タイル (国土地理院 淡色地図)
          </a>
          {" / "}施設データ: 江東区・東京都 (CC-BY 4.0)
        </p>
      </header>

      <div className="px-4 py-2 border-b border-gray-200 bg-amber-50">
        <JmaWarningPanel />
      </div>

      <div className="flex-1 overflow-hidden">
        <DisasterMapClient points={points} />
      </div>
    </div>
  );
}
