import Link from "next/link";
import { KanjiText } from "@/components/Furigana";

// Always-on disaster quick links on the home page. The official 江東区防災
// ポータル puts emergency info first; HomeBanners already surface live
// warnings when they fire, but in平常時 the path to防災 was buried as one of
// seven nav cards. This strip keeps防災マップ and防災の備え one tap away at
// all times — preparedness is something you reach for before the event, not
// after.
const LINKS = [
  {
    href: "/disaster",
    label: "防災マップ",
    sub: "避難所・給水・ハザード",
    icon: "🗺️",
  },
  {
    href: "/disaster/guide",
    label: "防災の備え",
    sub: "備蓄・避難の心得",
    icon: "🎒",
  },
] as const;

export default function DisasterQuickAccess() {
  return (
    <nav aria-label="防災への近道" className="grid grid-cols-2 gap-2">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 hover:bg-rose-100"
        >
          <span aria-hidden="true" className="text-lg flex-shrink-0">
            {l.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-rose-900">
              <KanjiText text={l.label} />
            </span>
            <span className="block text-xs text-rose-700 truncate">
              <KanjiText text={l.sub} />
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
