import Link from "next/link";

type Props = {
  // Override the destination when a sub-page wants to step up one level
  // (e.g. /gomi/search returning to /gomi). Defaults to the home route.
  href?: string;
  label?: string;
};

export default function BackToHome({ href = "/", label = "ホームへ戻る" }: Props) {
  return (
    <nav aria-label="ページ内ナビゲーション" className="mb-4">
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      >
        <span aria-hidden="true">←</span>
        <span>{label}</span>
      </Link>
    </nav>
  );
}
