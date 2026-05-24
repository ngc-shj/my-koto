import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import SettingsPageClient from "./SettingsPageClient";

export const metadata: Metadata = {
  title: "設定 | My こうとう (非公式)",
  description: "ごみ収集地区の変更やプライバシー設定を管理します。",
};

export default function SettingsPage() {
  return (
    <div>
      <PageHeader back={{ href: "/", label: "ホームへ戻る" }} title="設定" />
      <SettingsPageClient />
    </div>
  );
}
