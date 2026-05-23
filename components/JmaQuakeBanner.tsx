"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KanjiText } from "@/components/Furigana";
import { formatDateTime } from "@/lib/i18n/datetime";
import { pickBannerQuake } from "@/lib/jma/banner";
import type { NormalizedQuake, QuakeFeed } from "@/lib/jma/quake";

type State =
  | { status: "loading" }
  | { status: "none" }
  | { status: "active"; quake: NormalizedQuake };

function isQuakeFeed(v: unknown): v is QuakeFeed {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.events) && typeof o.feltInKotoCount === "number";
}

function shindoTone(maxi: string): string {
  const head = maxi[0] ?? "0";
  if (head === "7" || head === "6") return "border-red-500 bg-red-50 text-red-900";
  if (head === "5") return "border-red-400 bg-red-50 text-red-900";
  if (head === "4") return "border-orange-400 bg-orange-50 text-orange-900";
  if (head === "3") return "border-amber-400 bg-amber-50 text-amber-900";
  return "border-yellow-300 bg-yellow-50 text-yellow-900";
}

export default function JmaQuakeBanner() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/jma-quakes", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          setState({ status: "none" });
          return;
        }
        const raw: unknown = await res.json();
        if (!isQuakeFeed(raw)) {
          setState({ status: "none" });
          return;
        }
        const quake = pickBannerQuake(raw, new Date());
        if (quake == null) {
          setState({ status: "none" });
          return;
        }
        setState({ status: "active", quake });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setState({ status: "none" });
      });
    return () => controller.abort();
  }, []);

  if (state.status !== "active") return null;

  const { quake } = state;
  const tone = shindoTone(quake.kotoShindo ?? "");

  return (
    <Link
      href="/weather"
      role="alert"
      className={`block rounded-lg border-2 p-3 ${tone} hover:brightness-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-amber-500`}
      aria-label={`江東区で震度 ${quake.kotoShindo} を観測 (${quake.epicenter})。詳細を確認`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-700 text-white">
          <KanjiText text="直近の地震" />
        </span>
        <span className="font-semibold tabular-nums">
          <KanjiText text={`江東区 震度 ${quake.kotoShindo}`} />
        </span>
        <span className="text-sm">
          <KanjiText text={quake.epicenter} />
        </span>
        <span className="text-xs text-gray-600 tabular-nums">
          {formatDateTime(quake.occurredAt)}
        </span>
        <span className="ml-auto text-xs underline">
          <KanjiText text="詳細を確認" />
        </span>
      </div>
    </Link>
  );
}
