import type {
  JmaQuakeEvent,
  JmaQuakeList,
} from "@/lib/opendata/schemas/jma-quake";

export type NormalizedQuake = {
  readonly eventId: string;
  readonly title: string;
  readonly reportDatetime: string;
  // Time the quake actually occurred (or report time when JMA omits it).
  readonly occurredAt: string;
  readonly epicenter: string;
  // Magnitude is a string upstream (JMA sometimes encodes "M6.0" etc.).
  // null when not announced (e.g. 震度速報 with no source confirmed yet).
  readonly magnitude: string | null;
  // Maximum observed shindo across the country, formatted as JMA sends it
  // ("2", "5-", "5+", "7"). Empty when not announced.
  readonly maxShindo: string;
  // Shindo observed in 江東区, or null when the ward did not feel it.
  readonly kotoShindo: string | null;
};

export type QuakeFeed = {
  readonly events: readonly NormalizedQuake[];
  // Convenience: count of `events` where kotoShindo != null. Pre-computed
  // here so the panel does not have to .filter on every render.
  readonly feltInKotoCount: number;
};

function findKotoShindo(
  ev: JmaQuakeEvent,
  kotoCityCode: string,
): string | null {
  for (const pref of ev.int ?? []) {
    for (const c of pref.city ?? []) {
      if (c.code === kotoCityCode) return c.maxi;
    }
  }
  return null;
}

function normalizeEvent(
  ev: JmaQuakeEvent,
  kotoCityCode: string,
): NormalizedQuake {
  return {
    eventId: ev.eid,
    title: ev.ttl,
    reportDatetime: ev.rdt,
    occurredAt: ev.at ?? ev.rdt,
    epicenter: ev.anm ?? "震源不明",
    magnitude: ev.mag ?? null,
    maxShindo: ev.maxi ?? "",
    kotoShindo: findKotoShindo(ev, kotoCityCode),
  };
}

export function buildQuakeFeed(
  events: JmaQuakeList,
  kotoCityCode: string,
  limit = 10,
): QuakeFeed {
  // Upstream returns latest-first. We cap at `limit` so the client payload
  // stays predictable even if JMA changes the list length.
  const trimmed = events.slice(0, limit);
  const normalized = trimmed.map((e) => normalizeEvent(e, kotoCityCode));
  const feltInKotoCount = normalized.reduce(
    (n, q) => (q.kotoShindo != null ? n + 1 : n),
    0,
  );
  return { events: normalized, feltInKotoCount };
}
