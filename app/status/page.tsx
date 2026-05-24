// Operational status dashboard.
//
// Aggregates three signals:
// 1. Bundled-data freshness (file mtime per data/*.json) so users can tell
//    when AED, gomi, etc. were last refreshed from upstream
// 2. Most recent /api/push/dispatch summary (set by lib/push/run-dispatch)
// 3. Most recent CSP violation reports (set by /api/csp-report)
//
// Server component on the Node runtime — fs.stat needs Node, and fetching
// from KV through @vercel/kv works equally well in both runtimes.
import type { Metadata } from "next";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import PageHeader from "@/components/PageHeader";
import { formatAuditDateTime } from "@/lib/i18n/datetime";
import {
  defaultCspReportKv,
  listReports,
  type StoredReport,
} from "@/lib/csp/reports";
import {
  defaultKv as defaultPushKv,
  type PushKv,
} from "@/lib/push/storage";
import {
  getLastDispatch,
  type StoredDispatchSummary,
} from "@/lib/push/last-dispatch";

export const runtime = "nodejs";
// /status renders snapshots that drift quickly; never cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ステータス | My こうとう (非公式)",
  description:
    "データ最終更新時刻・Push 配信ジョブ・CSP 違反レポートの観測ダッシュボード",
};

// Only static bundles get a file-mtime freshness row here. AED / トイレ /
// イベント moved to /api/datasets/* (KV-cached); their freshness is
// surfaced by the API response and KV TTL, not by an on-disk file.
const DATA_FILES: { id: string; label: string; path: string }[] = [
  { id: "districts", label: "ゴミ収集 地区", path: "data/districts.json" },
  { id: "gomi-dictionary", label: "ゴミ品目辞書", path: "data/gomi-dictionary.json" },
  { id: "shelter", label: "避難所", path: "data/shelter.json" },
  { id: "assembly-point", label: "避難場所", path: "data/assembly_point.json" },
  { id: "water-supply", label: "給水拠点", path: "data/water_supply.json" },
  { id: "park", label: "公園", path: "data/park.json" },
  { id: "library", label: "図書館", path: "data/library.json" },
  { id: "child-center", label: "児童館", path: "data/child_center.json" },
  { id: "nursery", label: "区立保育園", path: "data/nursery.json" },
];

type FreshnessRow =
  | { id: string; label: string; status: "ok"; lastModified: Date }
  | { id: string; label: string; status: "missing" };

async function readFreshness(): Promise<FreshnessRow[]> {
  const root = process.cwd();
  return Promise.all(
    DATA_FILES.map(async (entry) => {
      try {
        const info = await stat(join(root, entry.path));
        return {
          id: entry.id,
          label: entry.label,
          status: "ok" as const,
          lastModified: info.mtime,
        };
      } catch {
        return {
          id: entry.id,
          label: entry.label,
          status: "missing" as const,
        };
      }
    }),
  );
}

// Both KV reads have the same "if anything goes wrong, render empty"
// shape — KV outage on /status should not surface as a 500 because the
// freshness section is still useful on its own.
async function safeLastDispatch(
  kv: PushKv,
): Promise<StoredDispatchSummary | null> {
  try {
    return await getLastDispatch(kv);
  } catch {
    return null;
  }
}

async function safeListReports(): Promise<StoredReport[]> {
  try {
    return await listReports(defaultCspReportKv());
  } catch {
    return [];
  }
}

export default async function StatusPage() {
  const [freshness, lastDispatch, reports] = await Promise.all([
    readFreshness(),
    safeLastDispatch(defaultPushKv()),
    safeListReports(),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: "/", label: "ホームへ戻る" }}
        title="運用ステータス"
        subtitle="各データセットの最終更新時刻、Push 配信ジョブの直近実行結果、CSP 違反レポートの直近 50 件を表示します。"
        maxWidth="4xl"
      />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        <FreshnessSection rows={freshness} />
        <DispatchSection summary={lastDispatch} />
        <CspReportsSection reports={reports} />
      </div>
    </>
  );
}

function FreshnessSection({ rows }: { rows: FreshnessRow[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-800">データ最終更新時刻</h2>
      <p className="text-sm text-gray-600">
        ファイルシステム上の最終更新日時 (`mtime`) を表示します。
        通常は最後にデプロイされた時刻、または手動で `npx tsx scripts/generate-pois.ts` を実行した時刻に対応します。
      </p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-200">
            <th className="text-left font-normal py-1.5 pr-2">データセット</th>
            <th className="text-left font-normal py-1.5 pl-2">最終更新</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-100">
              <td className="py-1.5 pr-2 text-gray-800">{row.label}</td>
              <td className="py-1.5 pl-2">
                {row.status === "ok" ? (
                  <FormattedDate date={row.lastModified} />
                ) : (
                  <span className="text-amber-700">未配置</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DispatchSection({ summary }: { summary: StoredDispatchSummary | null }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-800">Push 配信ジョブ</h2>
      {summary == null ? (
        <p className="text-sm text-gray-500">直近の実行記録なし</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm border border-gray-200 rounded-lg p-4 bg-gray-50">
          <dt className="text-gray-500">直近の実行</dt>
          <dd className="font-medium text-gray-900">
            <FormattedDate date={new Date(summary.finishedAt)} />
          </dd>
          <dt className="text-gray-500">対象時間 (JST)</dt>
          <dd className="font-medium text-gray-900">{summary.hour}:00</dd>
          <dt className="text-gray-500">対象日</dt>
          <dd className="font-medium text-gray-900">{summary.tomorrow}</dd>
          <dt className="text-gray-500">送信試行</dt>
          <dd className="font-medium text-gray-900">{summary.attempted}</dd>
          <dt className="text-gray-500">成功</dt>
          <dd className="font-medium text-emerald-700">{summary.sent}</dd>
          <dt className="text-gray-500">失効購読 (削除済)</dt>
          <dd className="font-medium text-gray-700">{summary.expired}</dd>
          <dt className="text-gray-500">失敗 (購読は保持)</dt>
          <dd className="font-medium text-red-700">{summary.failed}</dd>
        </dl>
      )}
    </section>
  );
}

function CspReportsSection({ reports }: { reports: StoredReport[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-800">
        CSP 違反レポート
        <span className="ml-2 text-sm font-normal text-gray-500">
          (直近 {reports.length} 件)
        </span>
      </h2>
      {reports.length === 0 ? (
        <p className="text-sm text-gray-500">違反レポートはありません</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {reports.map((r, i) => (
            <li key={`${r.receivedAt}-${i}`} className="p-3 space-y-1">
              <div className="flex flex-wrap items-baseline gap-2 text-xs text-gray-500">
                <FormattedDate date={new Date(r.receivedAt)} />
                {r.userAgentFamily && (
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                    {r.userAgentFamily}
                  </span>
                )}
                {r.disposition && (
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      r.disposition === "enforce"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {r.disposition}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-800 font-medium">
                {r.violatedDirective}
              </div>
              <div className="text-xs text-gray-600 break-all">
                ブロック: {r.blockedURL || "—"}
              </div>
              <div className="text-xs text-gray-600 break-all">
                ページ: {r.documentPath || "—"}
              </div>
              {r.sample && (
                <pre className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all">
                  {r.sample}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FormattedDate({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()} className="font-medium text-gray-900">
      {formatAuditDateTime(date)}
    </time>
  );
}
