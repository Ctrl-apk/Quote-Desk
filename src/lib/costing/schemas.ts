import { z } from "zod";

/** Plain decimal text: digits with an optional fraction. No signs, no exponents, bounded length. */
const decimalText = z.string().trim().regex(/^\d{1,12}(\.\d{1,6})?$/, { error: "Enter a number" });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD" });

export const routingRowSchema = z.object({
  operation: z.string().trim().min(1, { error: "Operation is required" }).max(60),
  machineCode: z.string().trim().min(1, { error: "Choose a machine" }).max(30),
  cycleTimeMin: decimalText,
});

/** The costing form as received by the server. The cost engine does the business validation after this. */
export const costingFormSchema = z.object({
  quotedOn: isoDate,
  materialCode: z.string().trim().min(1, { error: "Material is required" }).max(30),
  grossWeightKg: decimalText,
  netWeightKg: decimalText,
  annualVolume: z.string().trim().regex(/^\d{1,9}$/, { error: "Enter a whole number" }),
  setupCost: decimalText,
  toolingCost: decimalText,
  routing: z.array(routingRowSchema).min(1, { error: "Add at least one operation" }).max(20),
  scrapPercent: decimalText,
  overheadPercent: decimalText,
  packingPerUnit: decimalText,
  freightPerUnit: z.tuple([decimalText, decimalText, decimalText]),
  markupPercent: decimalText,
  gstPercent: decimalText,
});

export const savePayloadSchema = z.object({
  partId: z.string().min(1).max(64),
  form: costingFormSchema,
});

/** Part fields a person can set. Source and accepted state are handled by the service, never sent by the client. */
export const EDITABLE_PART_FIELDS = ["materialCode", "grossWeightKg", "netWeightKg", "annualVolume"] as const;
export type EditablePartField = (typeof EDITABLE_PART_FIELDS)[number];

export const updatePartFieldSchema = z.discriminatedUnion("field", [
  z.object({ partId: z.string().min(1).max(64), field: z.literal("materialCode"), value: z.string().trim().min(1).max(30) }),
  z.object({ partId: z.string().min(1).max(64), field: z.literal("grossWeightKg"), value: decimalText }),
  z.object({ partId: z.string().min(1).max(64), field: z.literal("netWeightKg"), value: decimalText }),
  z.object({ partId: z.string().min(1).max(64), field: z.literal("annualVolume"), value: z.string().trim().regex(/^\d{1,9}$/) }),
]);

export const acceptFieldSchema = z.object({
  partId: z.string().min(1).max(64),
  field: z.enum(EDITABLE_PART_FIELDS),
});

export const submitSchema = z.object({ quoteId: z.string().min(1).max(64) });

export const decisionSchema = z.object({
  quoteId: z.string().min(1).max(64),
  action: z.enum(["approve", "reject"]),
  comment: z.string().max(2000).default(""),
});
export const sendSchema = z.object({ quoteId: z.string().min(1).max(64) });
export const outcomeSchema = z.object({
  quoteId: z.string().min(1).max(64),
  outcome: z.enum(["won", "lost"]),
  reason: z.string().max(2000).default(""),
});

/** Material and gross weight to look up a routing suggestion for. */
export const suggestRoutingSchema = z.object({
  materialCode: z.string().trim().min(1, "Choose a material").max(30),
  grossWeightKg: z.string().trim().regex(/^\d{1,6}(\.\d{1,4})?$/, "Enter a gross weight").refine((v) => Number(v) > 0, "Enter a gross weight"),
});
