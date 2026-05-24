import Link from "next/link";
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
import { fetchEventsDataset } from "@/lib/opendata/datasets/events";
import { filterUpcoming, toEvent } from "@/lib/events/normalize";
import districtsRaw from "@/data/districts.json";
import overlaysRaw from "@/data/gomi-schedule.json";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

// Revalidate the home page hourly so the events list never goes more than
// 60 minutes stale without paying the upstream-fetch cost on every visit.
export const revalidate = 3600;

export default async function HomePage() {
  // Server-side data prep so the Today summary's first paint already has
  // every district / overlay / event it needs without a client roundtrip.
  // Districts / overlays are tiny static files; events come from the
  // CKAN-backed dataset fetched server-side and cached via ISR.
  const districts: District[] = DistrictSchema.array().parse(districtsRaw);
  const overlays: SpecialOverlay[] =
    SpecialOverlaySchema.array().parse(overlaysRaw);
  const eventsDataset = await fetchEventsDataset();
  const events = eventsDataset.result.records.map(toEvent);
  const upcomingEvents = filterUpcoming(events).slice(0, 5);

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
        <NavCard
          href="/gomi"
          title="ゴミ収集"
          description="収集日カレンダー・品目検索"
          icon={<TrashIcon />}
        />
        <NavCard
          href="/map"
          title="区民マップ"
          description="AED・公園・駅・病院などを検索"
          icon={<MapPinIcon />}
        />
        <NavCard
          href="/disaster"
          title="防災マップ"
          description="避難所・避難場所・給水拠点・気象警報"
          icon={<ShieldIcon />}
        />
        <NavCard
          href="/events"
          title="イベント"
          description="区主催イベント一覧"
          icon={<CalendarIcon />}
        />
        <NavCard
          href="/weather"
          title="天気・防災情報"
          description="気温・WBGT・気象警報・地震情報"
          icon={<CloudIcon />}
        />
        <NavCard
          href="/bus"
          internal
          title="バス時刻表"
          description="都営バス・しおかぜ・バス停名で検索"
          icon={<BusIcon />}
        />
        <NavCard
          href="/settings"
          title="設定"
          description="プロファイル・通知・表示設定"
          icon={<CogIcon />}
        />
      </nav>
    </div>
  );
}

// Card wrapper for the home nav grid. `internal` swaps the underlying
// element from <a> to <Link> for prefetching where it actually helps
// (currently only /bus, which is the heaviest landing target).
function NavCard({
  href,
  title,
  description,
  icon,
  internal = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  internal?: boolean;
}) {
  const inner = (
    <div className="flex items-start gap-3">
      <span className="text-slate-500 flex-shrink-0 mt-0.5" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-lg font-medium">
          <KanjiText text={title} />
        </div>
        <div className="text-sm text-gray-500 mt-1">
          <KanjiText text={description} />
        </div>
      </div>
    </div>
  );
  const className =
    "block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors";
  const label = `${title} — ${description}`;
  if (internal) {
    return (
      <Link href={href} aria-label={label} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <a href={href} aria-label={label} className={className}>
      {inner}
    </a>
  );
}

// Heroicons (outline) inlined to avoid pulling in the @heroicons package
// just for the home nav. Each icon is 24×24, strokes currentColor so the
// parent can theme via Tailwind text-* utilities.
function HeroIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.6}
      stroke="currentColor"
      className="w-6 h-6"
    >
      {children}
    </svg>
  );
}

function TrashIcon() {
  return (
    <HeroIcon>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </HeroIcon>
  );
}

function MapPinIcon() {
  return (
    <HeroIcon>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
      />
    </HeroIcon>
  );
}

function ShieldIcon() {
  return (
    <HeroIcon>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m0 3.75h.008v.008H12v-.008Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.49 3.17c.18-.34.66-.34.84 0l9.06 17.06c.18.34-.06.77-.42.77H2.85c-.36 0-.6-.43-.42-.77L11.49 3.17Z"
      />
    </HeroIcon>
  );
}

function CalendarIcon() {
  return (
    <HeroIcon>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
      />
    </HeroIcon>
  );
}

function CloudIcon() {
  return (
    <HeroIcon>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z"
      />
    </HeroIcon>
  );
}

function BusIcon() {
  return (
    <HeroIcon>
      <g strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="13" rx="2.25" />
        <line x1="4" y1="11" x2="20" y2="11" />
        <line x1="9.5" y1="4.5" x2="9.5" y2="10.5" />
        <line x1="14.5" y1="4.5" x2="14.5" y2="10.5" />
        <circle cx="7.75" cy="19" r="1.25" />
        <circle cx="16.25" cy="19" r="1.25" />
        <line x1="6.5" y1="14" x2="8" y2="14" />
        <line x1="16" y1="14" x2="17.5" y2="14" />
      </g>
    </HeroIcon>
  );
}

function CogIcon() {
  return (
    <HeroIcon>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992.005.085.005.17 0 .255-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991-.005-.085-.005-.17 0-.255.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.28Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </HeroIcon>
  );
}
