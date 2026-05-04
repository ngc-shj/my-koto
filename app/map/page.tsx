import type { Metadata } from "next";
import { parseAedData, parseToiletData } from "@/lib/map/validate";
import { MAP_TILE } from "@/config/map";
import MapClient from "./MapClient";
import aedRaw from "@/data/aed.json";
import toiletRaw from "@/data/toilet.json";

export const metadata: Metadata = {
  title: "AED・公衆トイレマップ | My こうとう (非公式)",
  description: "江東区内のAED設置場所と公衆トイレを地図で確認できます。",
};

type SearchParams = { type?: string };

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const typeParam = params.type ?? "aed,toilet";
  const activeTypes = typeParam.split(",").map((t) => t.trim());

  const aedPoints = parseAedData(aedRaw);
  const toiletPoints = parseToiletData(toiletRaw);
  const allPoints = [...aedPoints, ...toiletPoints];

  const initialFilters = {
    aed: activeTypes.includes("aed"),
    toilet: activeTypes.includes("toilet"),
    barrierFreeOnly: false,
    twentyFourOnly: false,
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="px-4 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold text-slate-700">AED・公衆トイレマップ</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          地図データ:{" "}
          <a
            href={MAP_TILE.attributionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-700"
          >
            {MAP_TILE.attribution}
          </a>
        </p>
      </header>
      <div className="flex-1 overflow-hidden">
        <MapClient points={allPoints} initialFilters={initialFilters} />
      </div>
    </div>
  );
}
