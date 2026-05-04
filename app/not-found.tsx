import Link from "next/link";
import { KanjiAuto } from "@/components/Furigana";
import { messages } from "@/lib/i18n/messages";

export default function NotFound() {
  return (
    <KanjiAuto>
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-4xl font-bold text-gray-400 mb-4">404</h1>
        <h2 className="text-xl font-semibold mb-2">{messages.error.notFound}</h2>
        <p className="text-gray-600 mb-8">{messages.error.notFoundDescription}</p>
        <Link
          href="/"
          className="inline-block px-6 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 transition-colors"
        >
          {messages.error.backHome}
        </Link>
      </div>
    </KanjiAuto>
  );
}
