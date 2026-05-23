"use client";

import Link from "next/link";
import { useMemo } from "react";
import { messages } from "@/lib/i18n/messages";
import HomeBanners from "@/components/HomeBanners";
import ShareButton from "@/components/ShareButton";
import TodaySummary from "@/components/TodaySummary";
import { KanjiText } from "@/components/Furigana";
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

// Home is a Client Component so the page has no Server→Client boundary
// inside it. We hit a Next 15 dev-mode chunk-resolution race when the
// soft navigation /map → / arrived before the banner chunks loaded
// ("Cannot read properties of undefined (reading 'call')"). The static
// JSON parse stays cheap (~58 districts + 2 overlays + 10 events) so
// running it once on mount is essentially free, and `useMemo` keeps the
// parse from re-running on prop-less re-renders.
export default function HomePage() {
  const { districts, overlays, upcomingEvents } = useMemo(() => {
    const districts: District[] = DistrictSchema.array().parse(districtsRaw);
    const overlays: SpecialOverlay[] =
      SpecialOverlaySchema.array().parse(overlaysRaw);
    const events = EventResponseSchema.parse(eventsRaw).result.records.map(
      toEvent,
    );
    const upcomingEvents = filterUpcoming(events).slice(0, 5);
    return { districts, overlays, upcomingEvents };
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-700">
              <KanjiText text={messages.brand.title} />
            </h1>
            <p className="mt-2 text-gray-600">
              <KanjiText text={messages.brand.tagline} />
            </p>
          </div>
          <ShareButton title={messages.brand.title} url={SITE_URL || undefined} />
        </div>
      </header>

      <div className="mb-4 space-y-2">
        <HomeBanners />
      </div>

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
          aria-label="ゴミ収集 — 収集日カレンダー・品目検索"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">
            <KanjiText text="ゴミ収集" />
          </div>
          <div className="text-sm text-gray-500 mt-1">
            <KanjiText text="収集日カレンダー・品目検索" />
          </div>
        </a>
        <a
          href="/map"
          aria-label="区民マップ — AED・避難所・公園・駅・病院など"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">
            <KanjiText text="区民マップ" />
          </div>
          <div className="text-sm text-gray-500 mt-1">
            <KanjiText text="AED・避難所・公園・駅・病院など" />
          </div>
        </a>
        <a
          href="/events"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">イベント</div>
          <div className="text-sm text-gray-500 mt-1">
            <KanjiText text="区主催イベント一覧" />
          </div>
        </a>
        <a
          href="/weather"
          aria-label="天気・防災情報 — 気温・WBGT・気象警報・地震情報"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">
            <KanjiText text="天気・防災情報" />
          </div>
          <div className="text-sm text-gray-500 mt-1">
            <KanjiText text="気温・WBGT・気象警報・地震情報" />
          </div>
        </a>
        <Link
          href="/bus"
          aria-label="バス時刻表 — 都営バス・しおかぜ・バス停名で検索"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">
            <KanjiText text="バス時刻表" />
          </div>
          <div className="text-sm text-gray-500 mt-1">
            <KanjiText text="都営バス・しおかぜ・バス停名で検索" />
          </div>
        </Link>
        <a
          href="/settings"
          aria-label="設定 — プロファイル・通知・表示設定"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">
            <KanjiText text="設定" />
          </div>
          <div className="text-sm text-gray-500 mt-1">
            <KanjiText text="プロファイル・通知・表示設定" />
          </div>
        </a>
      </nav>
    </div>
  );
}
