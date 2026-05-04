import districts from "@/data/districts.json";

export const DISTRICT_IDS: readonly string[] = districts.map(
  (d: { id: string }) => d.id,
);

export function isValidDistrictId(input: string): boolean {
  return /^[a-z0-9-]{1,32}$/.test(input) && DISTRICT_IDS.includes(input);
}
