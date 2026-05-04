"use client";

import { useEffect } from "react";
import Link from "next/link";
import { KanjiAuto } from "@/components/Furigana";
import { messages } from "@/lib/i18n/messages";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to error reporting service when available (Phase 2)
    console.error(error);
  }, [error]);

  return (
    <KanjiAuto>
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-semibold mb-2">{messages.error.generic}</h1>
        <p className="text-gray-600 mb-8">
          予期しないエラーが発生しました。しばらく経ってから再度お試しください。
        </p>
        <div className="flex gap-4 justify-center">
          <button
            type="button"
            onClick={reset}
            className="px-6 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 transition-colors"
          >
            {messages.error.retry}
          </button>
          <Link
            href="/"
            className="px-6 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            {messages.error.backHome}
          </Link>
        </div>
      </div>
    </KanjiAuto>
  );
}
