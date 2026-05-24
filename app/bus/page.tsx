import type { Metadata } from "next";
import BusFinder, {
  type BusRouteSearchOption,
  type BusStopSearchOption,
} from "@/components/BusFinder";
import { KanjiText } from "@/components/Furigana";
import PageFooter from "@/components/PageFooter";
import PageHeader from "@/components/PageHeader";
import districtsRaw from "@/data/districts.json";
import { openDatasetsDb } from "@/lib/opendata/db/client";
import { readBus } from "@/lib/opendata/db/readers";
import { DistrictSchema } from "@/lib/gomi/types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const metadata: Metadata = {
  title: "バス時刻表 | My こうとう (非公式)",
  description:
    "バス停名や系統名で検索して、都営バスの時刻表・路線図を確認できます。",
};

function buildStopOptions(
  data: Awaited<ReturnType<typeof readBus>>,
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

function buildRouteOptions(
  data: Awaited<ReturnType<typeof readBus>>,
): readonly BusRouteSearchOption[] {
  return data.routes
    .map((r) => ({
      routeId: r.routeId,
      shortName: r.shortName,
      longName: r.longName,
      directions: r.directions.map((d) => ({
        directionId: d.directionId,
        headsign: d.headsign,
      })),
    }))
    .sort((a, b) => a.shortName.localeCompare(b.shortName, "ja"));
}

export default async function BusIndexPage() {
  const data = await readBus(openDatasetsDb());
  const stops = buildStopOptions(data);
  const routes = buildRouteOptions(data);

  const districts = DistrictSchema.array().parse(districtsRaw);
  const districtLabelById: Record<string, string> = {};
  for (const d of districts) {
    districtLabelById[d.id] = d.label;
  }

  return (
    <>
      <PageHeader
        back={{ href: "/", label: "ホームへ戻る" }}
        title="バス時刻表（都営バス）"
        share={{ title: "バス時刻表", url: `${SITE_URL}/bus` }}
      />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-sm text-gray-600 mb-6">
          <KanjiText text="バス停名または系統名で検索して、時刻表・路線図を確認できます。江東区コミュニティバス「しおかぜ」(江東01) も含まれます。" />
        </p>

        <BusFinder
          stops={stops}
          routes={routes}
          districtLabelById={districtLabelById}
        />

        <PageFooter dataset="toei-bus">
          <p className="text-xs text-gray-400">
            <KanjiText text="feed バージョン:" /> {data.feedVersion}
          </p>
        </PageFooter>
      </main>
    </>
  );
}
