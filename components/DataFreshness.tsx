"use client";

type DataFreshnessProps = {
  lastModified: Date | string;
  warnAfterDays?: number;
  warnAfterHours?: number;
  label?: string;
};

export default function DataFreshness({
  lastModified,
  warnAfterDays,
  warnAfterHours,
  label = "データ取得日",
}: DataFreshnessProps) {
  const modifiedDate = typeof lastModified === "string" ? new Date(lastModified) : lastModified;
  const now = new Date();
  const diffMs = now.getTime() - modifiedDate.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  const thresholdHours = warnAfterHours ?? (warnAfterDays != null ? warnAfterDays * 24 : null);
  const isStale = thresholdHours != null && diffHours > thresholdHours;

  const formattedDate = modifiedDate.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div>
      <p className="text-xs text-gray-500">
        {label}: {formattedDate} JST
      </p>
      {isStale && (
        <p
          role="alert"
          className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1"
        >
          データが古い可能性があります。公式サイトでご確認ください。
        </p>
      )}
    </div>
  );
}
