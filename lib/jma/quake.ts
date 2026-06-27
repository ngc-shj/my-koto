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
// 情報 → 震源・震度情報, all sharing one eid) down to one revision. Without
// this the same quake appears several times — and the duplicate eids collide
// as React keys.
//
// Crucially we must NOT simply take the highest `ctt`: late follow-ups such as
// 「顕著な地震の震源要素更新のお知らせ」 carry no `int` (per-area shindo) block,
// so picking them would erase the ward's observed intensity and the quake then
// vanishes from a ward-scoped feed. So a revision that HAS intensity data
// always beats one that doesn't; among equals, newer `ctt` wins.
function hasIntensity(ev: JmaQuakeEvent): boolean {
  return (ev.int ?? []).some((p) => (p.city ?? []).length > 0 || p.maxi != null);
}

function preferRevision(a: JmaQuakeEvent, b: JmaQuakeEvent): JmaQuakeEvent {
  const aInt = hasIntensity(a);
  const bInt = hasIntensity(b);
  if (aInt !== bInt) return aInt ? a : b;
  return (b.ctt ?? "") > (a.ctt ?? "") ? b : a;
}

function latestPerEvent(events: JmaQuakeList): JmaQuakeEvent[] {
  const byEid = new Map<string, JmaQuakeEvent>();
  for (const ev of events) {
    const prev = byEid.get(ev.eid);
    byEid.set(ev.eid, prev == null ? ev : preferRevision(prev, ev));
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
