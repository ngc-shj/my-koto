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
  // Shindo observed in 江東区, formatted as JMA sends it. Always populated
  // — the feed only includes events the ward actually felt.
  readonly kotoShindo: string;
};

export type QuakeFeed = {
  readonly events: readonly NormalizedQuake[];
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
  kotoShindo: string,
): NormalizedQuake {
  return {
    eventId: ev.eid,
    title: ev.ttl,
    reportDatetime: ev.rdt,
    occurredAt: ev.at ?? ev.rdt,
    epicenter: ev.anm ?? "震源不明",
    magnitude: ev.mag ?? null,
    maxShindo: ev.maxi ?? "",
    kotoShindo,
  };
}

// Collapse the multiple reports JMA emits per quake (震度速報 → 震源に関する
// 情報 → 震源・震度情報, all sharing one eid) down to the latest revision.
// Without this the same quake appears several times — and the duplicate eids
// collide as React keys. Newer `ctt` wins; when ctt is absent we keep the
// first occurrence, which is the latest since upstream is ordered latest-first.
function latestPerEvent(events: JmaQuakeList): JmaQuakeEvent[] {
  const byEid = new Map<string, JmaQuakeEvent>();
  for (const ev of events) {
    const prev = byEid.get(ev.eid);
    if (prev == null) {
      byEid.set(ev.eid, ev);
      continue;
    }
    const prevCtt = prev.ctt ?? "";
    const curCtt = ev.ctt ?? "";
    if (curCtt > prevCtt) byEid.set(ev.eid, ev);
  }
  return [...byEid.values()];
}

export function buildQuakeFeed(
  events: JmaQuakeList,
  kotoCityCode: string,
  limit = 10,
): QuakeFeed {
  // Upstream returns latest-first across the country. Scope the feed to
  // events 江東区 actually observed — the panel is ward-specific, and a
  // nationwide list buries the few quakes that mattered locally under
  // dozens of unrelated ones. Dedupe revisions first so each quake is one row.
  const normalized: NormalizedQuake[] = [];
  for (const ev of latestPerEvent(events)) {
    const kotoShindo = findKotoShindo(ev, kotoCityCode);
    if (kotoShindo == null) continue;
    normalized.push(normalizeEvent(ev, kotoCityCode, kotoShindo));
    if (normalized.length >= limit) break;
  }
  return { events: normalized };
}
