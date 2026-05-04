import type { Metadata } from "next";
import GomiSearchClient from "./GomiSearchClient";

export const metadata: Metadata = {
  title: "ゴミ品目検索 | My こうとう (非公式)",
  description: "ゴミの分別方法を品目名で検索できます。",
};

export default function GomiSearchPage() {
  return <GomiSearchClient />;
}
