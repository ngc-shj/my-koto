import Link from "next/link";
import type { ReactNode } from "react";
import { KanjiText } from "@/components/Furigana";
import ShareButton from "@/components/ShareButton";

type Props = {
  // The contextual back link. Omitted on top-level pages with no parent.
  back?: { readonly href: string; readonly label: string };
  title: string;
  // Rendered immediately under the h1 — used for "○○系統 / ××方面" style
  // contextual info on bus-stop detail pages. ReactNode so callers can
  // pass a <Link> or other interactive markup.
  subtitle?: ReactNode;
  // Optional share affordance, identical to the standalone ShareButton.
  share?: { readonly title: string; readonly url?: string };
  // Hide the persistent home icon when the page itself is /.
  hideHomeLink?: boolean;
  // Controls the inner content width so the header aligns with its page
  // body. Pages with narrow body content (max-w-2xl) should pass "2xl";
  // wider pages use "4xl".
  maxWidth?: "2xl" | "4xl";
};

export default function PageHeader({
  back,
  title,
  subtitle,
  share,
  hideHomeLink = false,
  maxWidth = "2xl",
}: Props) {
  const widthClass = maxWidth === "4xl" ? "max-w-4xl" : "max-w-2xl";
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className={`${widthClass} mx-auto px-4 pt-3 pb-3`}>
        {back && (
          <nav aria-label="ページ内ナビゲーション" className="mb-1.5">
            <Link
              href={back.href}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              <span aria-hidden="true">←</span>
              <span>
                <KanjiText text={back.label} />
              </span>
            </Link>
          </nav>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 break-words">
              <KanjiText text={title} />
            </h1>
            {subtitle != null && (
              <div className="text-sm text-gray-600 mt-1">{subtitle}</div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {share && <ShareButton title={share.title} url={share.url} />}
            {!hideHomeLink && (
              <Link
                href="/"
                aria-label="ホームへ移動"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5"
                  aria-hidden="true"
                >
                  <path d="M3 11l9-8 9 8" />
                  <path d="M5 10v10h14V10" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
