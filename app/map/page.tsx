import type { Metadata } from "next";
import { parseAedData, parseToiletData } from "@/lib/map/validate";
import { MAP_TILE } from "@/config/map";
import MapClient from "./MapClient";
import BackToHome from "@/components/BackToHome";
import ShareButton from "@/components/ShareButton";
import aedRaw from "@/data/aed.json";
import toiletRaw from "@/data/toilet.json";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

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
    // Radius applies only after geolocation consent. Default 1km is a
    // reasonable walking-distance scope for AED/toilet finding.
    radius: 1000 as const,
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <BackToHome />
            <h1 className="text-lg font-semibold text-slate-700">AED・公衆トイレマップ</h1>
          </div>
          <ShareButton title="AED・公衆トイレマップ" url={`${SITE_URL}/map`} />
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
          {" / "}施設データ: 江東区 (CC-BY 4.0) +{" "}
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
