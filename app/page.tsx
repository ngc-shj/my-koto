import { messages } from "@/lib/i18n/messages";
import WeatherWidget from "@/components/WeatherWidget";
import ShareButton from "@/components/ShareButton";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-700">{messages.brand.title}</h1>
            <p className="mt-2 text-gray-600">{messages.brand.tagline}</p>
          </div>
          <ShareButton title={messages.brand.title} url={SITE_URL || undefined} />
        </div>
      </header>

      <div className="mb-6">
        <WeatherWidget />
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
            地区選択・通知・表示設定
          </div>
        </a>
      </nav>
    </div>
  );
}
