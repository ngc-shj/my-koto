import type { Metadata } from "next";
import districtsData from "@/data/districts.json";
import overlaysData from "@/data/gomi-schedule.json";
import { DistrictSchema, SpecialOverlaySchema } from "@/lib/gomi/types";
import ShareButton from "@/components/ShareButton";
import GomiPageClient from "./GomiPageClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const metadata: Metadata = {
  title: "ごみ収集カレンダー | My こうとう (非公式)",
  description: "江東区のごみ収集スケジュールを地区別に確認できます。",
};

export default function GomiPage() {
  // Validate and parse the static JSON data at build time.
  const districts = districtsData.map((d) => DistrictSchema.parse(d));
  const overlays = overlaysData.map((o) => SpecialOverlaySchema.parse(o));

  return (
    <div>
      {/* Share button is positioned at the top; GomiPageClient renders its own heading below */}
      <div className="max-w-2xl mx-auto px-4 pt-8 flex justify-end">
        <ShareButton title="ごみ収集カレンダー" url={`${SITE_URL}/gomi`} />
      </div>
      <GomiPageClient districts={districts} overlays={overlays} />
    </div>
  );
}
