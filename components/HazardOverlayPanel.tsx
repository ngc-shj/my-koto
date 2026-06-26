"use client";

import {
  HAZARD_OVERLAYS,
  HAZARD_OVERLAY_GROUPS,
  type HazardOverlayGroup,
  type HazardOverlayId,
} from "@/config/hazard-tiles";

type Props = {
  active: ReadonlySet<HazardOverlayId>;
  onToggle: (id: HazardOverlayId) => void;
};

const GROUP_ORDER: readonly HazardOverlayGroup[] = ["mlit", "kikikuru"];

// Toggle list for hazard raster overlays, grouped by source family. State is
// owned by the caller (the map client) — this component is purely the UI.
export default function HazardOverlayPanel({ active, onToggle }: Props) {
  return (
    <div className="space-y-3">
      {GROUP_ORDER.map((group) => {
        const meta = HAZARD_OVERLAY_GROUPS[group];
        const overlays = HAZARD_OVERLAYS.filter((o) => o.group === group);
        return (
          <fieldset key={group} className="space-y-1.5">
            <legend className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span>{meta.label}</span>
              <a
                href={meta.legendUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-normal text-blue-600 underline hover:text-blue-800"
              >
                凡例
              </a>
            </legend>
            {overlays.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={active.has(o.id)}
                  onChange={() => onToggle(o.id)}
                  className="accent-purple-600"
                />
                <span>{o.label}</span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}
