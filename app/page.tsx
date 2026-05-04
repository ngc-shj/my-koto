import { messages } from "@/lib/i18n/messages";
import ShareButton from "@/components/ShareButton";
import TodaySummary from "@/components/TodaySummary";
import {
  DistrictSchema,
  SpecialOverlaySchema,
  type District,
  type SpecialOverlay,
} from "@/lib/gomi/types";
import { EventResponseSchema } from "@/lib/opendata/schemas/events";
import { filterUpcoming, toEvent } from "@/lib/events/normalize";
import districtsRaw from "@/data/districts.json";
import overlaysRaw from "@/data/gomi-schedule.json";
import eventsRaw from "@/data/events.json";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export default function HomePage() {
  // Server-side data prep so the Today summary's first paint already has
  // every district / overlay / event it needs without a client roundtrip.
  // Each parse is cheap (~58 districts, ~2 overlays, ~10 events).
  const districts: District[] = DistrictSchema.array().parse(districtsRaw);
  const overlays: SpecialOverlay[] = SpecialOverlaySchema.array().parse(overlaysRaw);
  const events = EventResponseSchema.parse(eventsRaw)
    .result.records.map(toEvent);
  const upcomingEvents = filterUpcoming(events).slice(0, 5);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-700">{messages.brand.title}</h1>
            <p className="mt-2 text-gray-600">{messages.brand.tagline}</p>
          </div>
          <ShareButton title={messages.brand.title} url={SITE_URL || undefined} />
        </div>
      </header>

      <div className="mb-8">
        <TodaySummary
          districts={districts}
          overlays={overlays}
          upcomingEvents={upcomingEvents}
        />
      </div>

      <nav className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <a
          href="/gomi"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">ゴミ収集</div>
          <div className="text-sm text-gray-500 mt-1">
            収集日カレンダー・品目検索
          </div>
        </a>
        <a
          href="/map"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">区民マップ</div>
          <div className="text-sm text-gray-500 mt-1">
            AED・避難所・公園・図書館など
          </div>
        </a>
        <a
          href="/events"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">イベント</div>
          <div className="text-sm text-gray-500 mt-1">区主催イベント一覧</div>
        </a>
        <a
          href="/weather"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">天気・暑さ指数</div>
          <div className="text-sm text-gray-500 mt-1">
            気温・降水確率・WBGT
          </div>
        </a>
        <a
          href="/settings"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">設定</div>
          <div className="text-sm text-gray-500 mt-1">
            プロファイル・通知・表示設定
          </div>
        </a>
      </nav>
    </div>
  );
}
