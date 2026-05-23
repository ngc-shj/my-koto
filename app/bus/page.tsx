import type { Metadata } from "next";
import Link from "next/link";
import Attribution from "@/components/Attribution";
import BackToHome from "@/components/BackToHome";
import { KanjiText } from "@/components/Furigana";
import ShareButton from "@/components/ShareButton";
import busData from "@/data/bus-toei.json";
import { BusToeiDataSchema } from "@/lib/opendata/schemas/bus";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const metadata: Metadata = {
  title: "バス時刻表 | My こうとう (非公式)",
  description:
    "江東区を通る都営バス系統の時刻表。系統を選んで停留所ごとの発車時刻を確認できます。",
};

export default function BusIndexPage() {
  const data = BusToeiDataSchema.parse(busData);
  const routes = [...data.routes].sort((a, b) =>
    a.shortName.localeCompare(b.shortName, "ja"),
  );

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <BackToHome />
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-2xl font-bold">
          <KanjiText text="バス時刻表（都営バス）" />
        </h1>
        <ShareButton title="バス時刻表" url={`${SITE_URL}/bus`} />
      </div>
      <p className="text-sm text-gray-600 mb-6">
        <KanjiText text="江東区を通る系統。系統を選ぶと停留所一覧と時刻が表示されます。" />
      </p>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {routes.map((r) => {
          const subtitle =
            r.directions.map((d) => d.headsign).filter((h) => h).join(" ⇄ ") ||
            r.longName ||
            "";
          return (
            <li key={r.routeId}>
              <Link
                href={`/bus/${encodeURIComponent(r.routeId)}`}
                className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label={`系統 ${r.shortName} ${subtitle}`}
              >
                <div className="font-medium text-gray-800">
                  <KanjiText text={r.shortName} />
                </div>
                {subtitle.length > 0 && (
                  <div className="text-xs text-gray-500 mt-1 truncate">
                    <KanjiText text={subtitle} />
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 space-y-1">
        <Attribution dataset="toei-bus" />
        <p className="text-xs text-gray-400">
          <KanjiText text="feed バージョン:" /> {data.feedVersion}
        </p>
      </div>
    </main>
  );
}
