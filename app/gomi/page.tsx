import type { Metadata } from "next";
import districtsData from "@/data/districts.json";
import overlaysData from "@/data/gomi-schedule.json";
import { DistrictSchema, SpecialOverlaySchema } from "@/lib/gomi/types";
import GomiPageClient from "./GomiPageClient";

export const metadata: Metadata = {
  title: "ごみ収集カレンダー | My こうとう (非公式)",
  description: "江東区のごみ収集スケジュールを地区別に確認できます。",
};

export default function GomiPage() {
  // Validate and parse the static JSON data at build time.
  const districts = districtsData.map((d) => DistrictSchema.parse(d));
  const overlays = overlaysData.map((o) => SpecialOverlaySchema.parse(o));

  return <GomiPageClient districts={districts} overlays={overlays} />;
}
