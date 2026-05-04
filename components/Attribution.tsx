"use client";

import { getAttribution } from "@/config/attribution";

type AttributionProps = {
  dataset: string;
};

export default function Attribution({ dataset }: AttributionProps) {
  const attr = getAttribution(dataset);

  if (!attr) return null;

  return (
    <p className="text-xs text-gray-500">
      出典: 「{attr.name}」、{attr.copyrightHolder}
      {attr.modified && " (一部加工して利用)"}、{" "}
      <a
        href={attr.licenseUrl}
        className="underline hover:text-gray-700"
        target="_blank"
        rel="noopener noreferrer"
      >
        {attr.licenseLabel}
      </a>
    </p>
  );
}
