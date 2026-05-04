import type { Metadata } from "next";
import BackToHome from "@/components/BackToHome";
import GomiSearchClient from "./GomiSearchClient";

export const metadata: Metadata = {
  title: "ゴミ品目検索 | My こうとう (非公式)",
  description: "ゴミの分別方法を品目名で検索できます。",
};

export default function GomiSearchPage() {
  return (
    <div>
      <div className="max-w-2xl mx-auto px-4 pt-8">
        <BackToHome href="/gomi" label="ごみ収集に戻る" />
      </div>
      <GomiSearchClient />
    </div>
  );
}
