import type { Metadata } from "next";
import BackToHome from "@/components/BackToHome";
import SettingsPageClient from "./SettingsPageClient";

export const metadata: Metadata = {
  title: "設定 | My こうとう (非公式)",
  description: "ごみ収集地区の変更やプライバシー設定を管理します。",
};

export default function SettingsPage() {
  return (
    <div>
      <div className="max-w-2xl mx-auto px-4 pt-8">
        <BackToHome />
      </div>
      <SettingsPageClient />
    </div>
  );
}
