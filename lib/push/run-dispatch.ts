// Pure orchestration for the cron-triggered push fan-out. Lives outside the
// route file so Next.js does not reject it as an invalid route export, and
// so tests can drive the same code path with an in-memory KV and a stub
// sender.
import districts from "@/data/districts.json";
import gomiSchedule from "@/data/gomi-schedule.json";
import { DistrictSchema, SpecialOverlaySchema } from "@/lib/gomi/types";
import {
  deleteSubscription,
  getSubscription,
  listBucket,
  type PushKv,
} from "./storage";
import { buildPayload, readJstClock } from "./dispatch";
import type { Sender } from "./sender";

export type DispatchSummary = {
  hour: number;
  tomorrow: string;
  attempted: number;
  sent: number;
  expired: number;
  failed: number;
};

export async function runDispatch(deps: {
  kv: PushKv;
  now: Date;
  send: Sender;
}): Promise<DispatchSummary> {
  const { kv, now, send } = deps;
  const clock = readJstClock(now);
  const tomorrowIso = formatLocalIso(clock.tomorrow);

  const overlays = SpecialOverlaySchema.array().parse(gomiSchedule);
  const districtList = DistrictSchema.array().parse(districts);

  let attempted = 0;
  let sent = 0;
  let expired = 0;
  let failed = 0;

  for (const district of districtList) {
    const subIds = await listBucket(kv, district.id, clock.hour);
    if (subIds.length === 0) continue;
    const payload = buildPayload(district, overlays, clock.tomorrow);
    if (payload == null) continue;

    for (const subId of subIds) {
      const record = await getSubscription(kv, subId);
      if (record == null) continue;
      attempted += 1;
      const result = await send(record, payload);
      if (result.ok) {
        sent += 1;
      } else if (result.expired) {
        expired += 1;
        await deleteSubscription(kv, subId);
      } else {
        failed += 1;
      }
    }
  }

  return {
    hour: clock.hour,
    tomorrow: tomorrowIso,
    attempted,
    sent,
    expired,
    failed,
  };
}

function formatLocalIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
