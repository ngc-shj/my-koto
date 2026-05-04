import { messages } from "@/lib/i18n/messages";

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-700">{messages.brand.title}</h1>
        <p className="mt-2 text-gray-600">{messages.brand.tagline}</p>
      </header>

      <nav className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <a
          href="/gomi"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">ゴミ収集</div>
          <div className="text-sm text-gray-500 mt-1">収集カレンダー・品目検索</div>
        </a>
        <a
          href="/map"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">マップ</div>
          <div className="text-sm text-gray-500 mt-1">AED・公衆トイレ</div>
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
          <div className="text-sm text-gray-500 mt-1">気温・WBGT</div>
        </a>
        <a
          href="/settings"
          className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="text-lg font-medium">設定</div>
          <div className="text-sm text-gray-500 mt-1">地区選択・表示設定</div>
        </a>
      </nav>
    </div>
  );
}
