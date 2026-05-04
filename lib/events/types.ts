import { z } from "zod";

// Application-level event model (normalized from EventRecord API schema).
export const EventSchema = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  location: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  url: z
    .string()
    .optional()
    .refine(
      (v) => {
        if (v === undefined || v === "") return true;
        try {
          return new URL(v).protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "URL must use https scheme" },
    ),
  organizer: z.string().optional(),
  note: z.string().optional(),
  status: z.enum(["confirmed", "cancelled"]).default("confirmed"),
});

export type Event = z.infer<typeof EventSchema>;
