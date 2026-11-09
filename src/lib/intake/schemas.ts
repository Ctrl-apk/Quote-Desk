import { z } from "zod";

const decimal = z.string().trim().regex(/^\d{1,6}(\.\d{1,4})?$/, { error: "Enter a number up to 999999.9999" });
const optional = <T extends z.ZodType<string>>(s: T) => z.union([z.literal(""), s]).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD" });

export const MAX_EMAIL_LENGTH = 20000;

export const extractSchema = z.object({ email: z.string().trim().min(10, { error: "Paste the RFQ email first." }).max(MAX_EMAIL_LENGTH, { error: "That email is too long." }) });

export const partValues = z.object({
  name: z.string().trim().min(1, { error: "Part name is required" }).max(120),
  materialCode: optional(z.string().trim().max(30)),
  grossWeightKg: optional(decimal),
  netWeightKg: optional(decimal),
  annualVolume: optional(z.string().trim().regex(/^\d{1,9}$/, { error: "Enter a whole number" })),
  partNumber: optional(z.string().trim().max(40, { error: "Part number is too long (40 characters at most)" })),
  drawingRef: optional(z.string().trim().max(60, { error: "Drawing reference is too long (60 characters at most)" })),
});

export const createFromIntakeSchema = z.object({
  customer: z.string().trim().min(1, { error: "Customer is required" }).max(80),
  dueDate: isoDate,
  sourceEmail: z.string().max(MAX_EMAIL_LENGTH).optional(),
  part: partValues,
  /** What the extractor proposed. A value that still equals its suggestion stays flagged until accepted. */
  suggested: partValues.partial().optional(),
});
export type CreateFromIntake = z.infer<typeof createFromIntakeSchema>;
