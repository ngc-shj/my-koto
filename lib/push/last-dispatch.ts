// Persistence helpers for the most recent push dispatch summary, surfaced
// on /status. The single-key shape (overwritten each cron tick) is the
// minimum needed to answer "did the cron run?" + "when?" + "how many?";
// we deliberately do not keep a history list — Discord webhook + GitHub
// Actions logs already provide one.
import type { PushKv } from "./storage";
import type { DispatchSummary } from "./run-dispatch";

const STORAGE_KEY = "push:last-dispatch";

export type StoredDispatchSummary = DispatchSummary & {
  // Wall-clock instant when the cron handler finished. Useful when no
  // subscribers were attempted ("did the cron actually run, or did
  // GitHub Actions skip a beat?").
  finishedAt: number;
};

export async function saveLastDispatch(
  kv: PushKv,
  summary: StoredDispatchSummary,
): Promise<void> {
  await kv.set(STORAGE_KEY, summary);
}

export async function getLastDispatch(
  kv: PushKv,
): Promise<StoredDispatchSummary | null> {
  const raw = await kv.get<unknown>(STORAGE_KEY);
  if (raw == null) return null;
  if (typeof raw !== "object") return null;
  // Loose runtime check: we reject anything that doesn't have the numeric
  // counters we rely on, but otherwise trust our own writer.
  const candidate = raw as Partial<StoredDispatchSummary>;
  if (
    typeof candidate.hour !== "number" ||
    typeof candidate.attempted !== "number" ||
    typeof candidate.sent !== "number" ||
    typeof candidate.expired !== "number" ||
    typeof candidate.failed !== "number" ||
    typeof candidate.tomorrow !== "string" ||
    typeof candidate.finishedAt !== "number"
  ) {
    return null;
  }
  return candidate as StoredDispatchSummary;
}
