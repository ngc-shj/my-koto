import { z } from "zod";

// Weekday identifiers used in weekly schedules.
export const WeekdaySchema = z.enum([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);

export type Weekday = z.infer<typeof WeekdaySchema>;

// All supported waste categories.
export const GomiCategorySchema = z.enum([
  "burnable",
  "non_burnable",
  "resource_plastic",
  "container_plastic",
  "pet_bottle",
  "bottles_cans",
  "bulky",
]);

export type GomiCategory = z.infer<typeof GomiCategorySchema>;

// Japanese display labels for each GomiCategory.
export const GOMI_CATEGORY_LABELS: Record<GomiCategory, string> = {
  burnable: "燃やすごみ",
  non_burnable: "燃やさないごみ",
  resource_plastic: "資源プラスチック",
  container_plastic: "容器包装プラスチック",
  pet_bottle: "ペットボトル",
  bottles_cans: "びん・かんなど",
  bulky: "粗大ごみ",
};

// Weekly collection schedule for a single district.
export const WeeklyScheduleSchema = z.object({
  burnable: z.array(WeekdaySchema),
  non_burnable: z.array(WeekdaySchema),
  resource_plastic: z.array(WeekdaySchema),
  container_plastic: z.array(WeekdaySchema),
  pet_bottle: z.array(WeekdaySchema),
  bottles_cans: z.array(WeekdaySchema),
  bulky: z.array(WeekdaySchema),
});

export type WeeklySchedule = z.infer<typeof WeeklyScheduleSchema>;

// District master record: associates an id with addresses and its weekly schedule.
// `reading` and `area` are optional so older fixtures still validate.
// `notes` carries operational caveats from the upstream CSV (e.g. biweekly hint).
export const DistrictSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string(),
  reading: z.string().optional(),
  area: z.enum(["fukagawa", "joto"]).optional(),
  addresses: z.array(z.string()),
  schedule: WeeklyScheduleSchema,
  notes: z.string().optional(),
});

export type District = z.infer<typeof DistrictSchema>;

export const AREA_LABELS = {
  fukagawa: "深川地域",
  joto: "城東地域",
} as const;

// Special date overlay that replaces the normal weekly schedule for the
// specified districts on a single date. `categories` is the flat list of
// waste streams collected on that date — empty array means "no collection".
// We replaced the previous PartialWeeklySchedule shape (F-04) so editors
// no longer have to keep the date and the matching weekday in sync — that
// duplicated coupling silently dropped overlay applications when a year
// rollover changed the weekday for the same Gregorian date.
export const SpecialOverlaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  districts: z.array(z.string()),
  categories: z.array(GomiCategorySchema),
  note: z.string().optional(),
});

export type SpecialOverlay = z.infer<typeof SpecialOverlaySchema>;

// A single resolved garbage collection occurrence on a specific date.
export type GomiOccurrence = {
  date: Date;
  categories: GomiCategory[];
};

// Date range used as input to schedule resolution.
export type DateRange = {
  from: Date;
  to: Date;
};
