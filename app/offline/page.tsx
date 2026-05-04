import Link from "next/link";
import { messages } from "@/lib/i18n/messages";

export default function OfflinePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <h1 className="text-xl font-semibold mb-2">{messages.error.offline}</h1>
      <p className="text-gray-600 mb-8">{messages.error.offlineDescription}</p>
      <p className="text-sm text-gray-500">
        オフラインでも、キャッシュ済みのゴミ収集・施設情報は引き続き閲覧できます。
      </p>
      <Link
        href="/"
        className="inline-block mt-6 px-6 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 transition-colors"
      >
        {messages.error.backHome}
      </Link>
    </div>
  );
}
