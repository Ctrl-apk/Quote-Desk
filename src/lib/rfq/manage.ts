import { z } from "zod";
import { partValues } from "@/lib/intake/schemas";
import type { RfqStatusValue } from "./overdue";

export const MAX_PARTS_PER_RFQ = 20;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD" });

/** True only for a date that exists (2026-02-30 does not). */
export const isRealDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso;

/** One part's specification as typed. Blank values are allowed (they can be filled on the costing screen), wrong ones are not. */
export const partDraftSchema = partValues.superRefine((p, ctx) => {
  const gross = p.grossWeightKg ? Number(p.grossWeightKg) : null;
  const net = p.netWeightKg ? Number(p.netWeightKg) : null;
  if (gross !== null && gross <= 0) ctx.addIssue({ code: "custom", path: ["grossWeightKg"], message: "Gross weight must be above zero" });
  if (net !== null && net <= 0) ctx.addIssue({ code: "custom", path: ["netWeightKg"], message: "Net weight must be above zero" });
  if (gross !== null && net !== null && net > gross) ctx.addIssue({ code: "custom", path: ["netWeightKg"], message: "Net weight cannot exceed gross weight" });
  if (p.annualVolume && Number(p.annualVolume) < 1) ctx.addIssue({ code: "custom", path: ["annualVolume"], message: "Annual volume must be at least 1" });
});
export type PartDraft = z.infer<typeof partDraftSchema>;

const customer = z.string().trim().min(1, { error: "Customer is required" }).max(80, { error: "Customer name is too long" });
const dueDate = isoDate.refine(isRealDate, { error: "That date does not exist" });

/** Where the parts came from. "excel" values were read from a customer's file, so each waits for the estimator's acceptance on the costing screen. */
export const partSourceSchema = z.enum(["manual", "excel"]);

export const createRfqSchema = z.object({
  customer,
  dueDate,
  source: partSourceSchema.optional(),
  parts: z.array(partDraftSchema).min(1, { error: "Add at least one part" }).max(MAX_PARTS_PER_RFQ, { error: `At most ${MAX_PARTS_PER_RFQ} parts per RFQ` }),
});
export type CreateRfqInput = z.infer<typeof createRfqSchema>;

export const updateRfqSchema = z.object({ rfqId: z.string().min(1), customer, dueDate });
export const addPartSchema = z.object({ rfqId: z.string().min(1), part: partDraftSchema });
export const renamePartSchema = z.object({ partId: z.string().min(1), name: z.string().trim().min(1, { error: "Part name is required" }).max(120) });
export const removePartSchema = z.object({ partId: z.string().min(1) });

/** RFQ details and its parts can change only while it is still being estimated. */
export function canEditRfq(status: RfqStatusValue): { ok: true } | { ok: false; message: string } {
  return status === "estimating" ? { ok: true } : { ok: false, message: `This RFQ is ${status}, so it can no longer be edited.` };
}

/** A part that has saved quote versions is part of the record and cannot be removed. */
export function canRemovePart(input: { partCount: number; quoteCount: number }): { ok: true } | { ok: false; message: string } {
  if (input.quoteCount > 0) return { ok: false, message: "This part has saved quote versions, so it cannot be removed." };
  if (input.partCount <= 1) return { ok: false, message: "An RFQ needs at least one part." };
  return { ok: true };
}
