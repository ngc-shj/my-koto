"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { searchDictionary } from "@/lib/search";
import type { DictionaryItem, SearchResult } from "@/lib/search";
import dictionaryData from "@/data/gomi-dictionary.json";

const dictionary = dictionaryData as DictionaryItem[];

// Display labels for each waste category.
const CATEGORY_LABELS: Record<string, string> = {
  burnable: "燃やすごみ",
  non_burnable: "燃やさないごみ",
  resource_plastic: "資源プラスチック",
  container_plastic: "容器包装プラスチック",
  pet_bottle: "ペットボトル",
  bottles_cans: "びん・かんなど",
  bulky: "粗大ごみ",
  special: "特別回収",
};

// Tailwind color classes for each category badge.
const CATEGORY_COLORS: Record<string, string> = {
  burnable: "bg-red-100 text-red-800",
  non_burnable: "bg-blue-100 text-blue-800",
  resource_plastic: "bg-green-100 text-green-800",
  container_plastic: "bg-teal-100 text-teal-800",
  pet_bottle: "bg-yellow-100 text-yellow-800",
  bottles_cans: "bg-purple-100 text-purple-800",
  bulky: "bg-gray-100 text-gray-800",
  special: "bg-orange-100 text-orange-800",
};

function CategoryBadge({ category }: { category: string }) {
  const label = CATEGORY_LABELS[category] ?? category;
  const color = CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-800";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {label}
    </span>
  );
}

function ItemCard({ item }: { item: DictionaryItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-gray-900">
          {item.label}
        </span>
        <CategoryBadge category={item.category} />
      </div>

      {/* Instruction is always visible */}
      <p className="mt-2 text-sm text-gray-700">{item.instruction}</p>

      {/* Expandable note section */}
      {item.note && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-expanded={expanded}
          >
            {expanded ? "▲ 注意事項を閉じる" : "▼ 注意事項を表示"}
          </button>
          {expanded && (
            <p className="mt-1 text-xs text-gray-600">{item.note}</p>
          )}
        </div>
      )}
    </li>
  );
}

function TruncationHint({ count }: { count: number }) {
  return (
    <p
      className="mt-2 rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-800"
      role="status"
    >
      検索結果が多いため、上位 {count} 件のみ表示しています。
      キーワードを追加して絞り込んでください。
    </p>
  );
}

export default function GomiSearchClient() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult>({
    items: [],
    truncated: false,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((q: string) => {
    setResult(searchDictionary(q, dictionary));
  }, []);

  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, 100);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, runSearch]);

  const hasQuery = query.trim().length > 0;
  const hasResults = result.items.length > 0;

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      {/* Search input */}
      <div className="relative">
        <label htmlFor="search-input" className="sr-only">
          品目名を入力
        </label>
        <input
          id="search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="品目名を入力（例: ペットボトル、PET）"
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      {/* Result count indicator */}
      {hasQuery && (
        <p className="mt-2 text-sm text-gray-500" aria-live="polite">
          {hasResults ? (
            <>
              <span className="font-medium text-gray-900">
                {result.items.length}
              </span>{" "}
              件見つかりました
            </>
          ) : (
            "0 件"
          )}
        </p>
      )}

      {/* Truncation hint for very short queries */}
      {result.truncated && <TruncationHint count={result.items.length} />}

      {/* Results list */}
      {hasQuery && hasResults && (
        <ul className="mt-4 space-y-3" aria-label="検索結果">
          {result.items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}

      {/* No-results message */}
      {hasQuery && !hasResults && (
        <div
          className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700"
          role="status"
        >
          <p className="font-medium">該当する品目が見つかりませんでした。</p>
          <p className="mt-1">
            別のキーワードでお試しいただくか、詳細は{" "}
            <a
              href="https://www.city.koto.lg.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            >
              江東区公式サイト
            </a>{" "}
            でご確認ください。
          </p>
        </div>
      )}

      {/* Data attribution */}
      <p className="mt-8 text-xs text-gray-400">
        出典:「ゴミの分別方法一覧」、東京都・江東区（一部加工して利用）、
        <a
          href="https://creativecommons.org/licenses/by/4.0/deed.ja"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          CC-BY 4.0
        </a>
      </p>
    </main>
  );
}
