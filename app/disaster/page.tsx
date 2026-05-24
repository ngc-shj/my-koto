import type { Metadata } from "next";
import JmaWarningPanel from "@/components/JmaWarningPanel";
import PageHeader from "@/components/PageHeader";
import {
  parseAssemblyPointData,
  parseShelterData,
  parseWaterSupplyData,
} from "@/lib/map/validate";
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
      <PageHeader
        back={{ href: "/", label: "ホームへ戻る" }}
        title="防災マップ"
        share={{ title: "防災マップ", url: `${SITE_URL}/disaster` }}
        maxWidth="4xl"
      />

      <div className="px-4 py-2 border-b border-gray-200 bg-amber-50">
        <JmaWarningPanel />
      </div>

      <div className="flex-1 overflow-hidden">
        <DisasterMapClient points={points} />
      </div>
    </div>
  );
}
