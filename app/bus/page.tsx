import type { Metadata } from "next";
import Attribution from "@/components/Attribution";
import BackToHome from "@/components/BackToHome";
import BusStopSearch, {
  type BusStopSearchOption,
} from "@/components/BusStopSearch";
import { KanjiText } from "@/components/Furigana";
import ShareButton from "@/components/ShareButton";
import busData from "@/data/bus-toei.json";
import districtsRaw from "@/data/districts.json";
import { BusToeiDataSchema } from "@/lib/opendata/schemas/bus";
import { DistrictSchema } from "@/lib/gomi/types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const metadata: Metadata = {
  title: "バス時刻表 | My こうとう (非公式)",
  description:
    "バス停名で検索して、そのバス停を通る都営バスの系統と時刻表を確認できます。",
};

function buildStopOptions(
  data: ReturnType<typeof BusToeiDataSchema.parse>,
): readonly BusStopSearchOption[] {
  const byStop = new Map<string, BusStopSearchOption>();
  for (const stop of Object.values(data.stops)) {
    byStop.set(stop.stopId, { stopId: stop.stopId, name: stop.name, serving: [] });
  }
  for (const route of data.routes) {
    for (const dir of route.directions) {
      for (const stopId of dir.stopSequence) {
        const opt = byStop.get(stopId);
        if (opt == null) continue;
        (opt.serving as Array<BusStopSearchOption["serving"][number]>).push({
          routeId: route.routeId,
          shortName: route.shortName,
          directionId: dir.directionId,
          headsign: dir.headsign,
        });
      }
    }
  }
  return Array.from(byStop.values())
    .filter((s) => s.serving.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export default function BusIndexPage() {
  const data = BusToeiDataSchema.parse(busData);
  const stops = buildStopOptions(data);

  const districts = DistrictSchema.array().parse(districtsRaw);
  const districtLabelById: Record<string, string> = {};
  for (const d of districts) {
    districtLabelById[d.id] = d.label;
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <BackToHome />
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-2xl font-bold">
          <KanjiText text="バス時刻表（都営バス）" />
        </h1>
        <ShareButton title="バス時刻表" url={`${SITE_URL}/bus`} />
      </div>
      <p className="text-sm text-gray-600 mb-6">
        <KanjiText text="バス停名で検索して、そのバス停を通る系統と時刻表を確認できます。江東区コミュニティバス「しおかぜ」(江東01) も含まれます。" />
      </p>

      <BusStopSearch stops={stops} districtLabelById={districtLabelById} />

      <div className="mt-8 space-y-1">
        <Attribution dataset="toei-bus" />
        <p className="text-xs text-gray-400">
          <KanjiText text="feed バージョン:" /> {data.feedVersion}
        </p>
      </div>
    </main>
  );
}
