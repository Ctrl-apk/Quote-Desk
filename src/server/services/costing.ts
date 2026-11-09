import { AuthError, authorize, type Permission, type SessionUser } from "@/lib/auth";
import { computeCosting, serializeTiers, snapshotFor, type CostingForm } from "@/lib/costing/form";
import {
  acceptFieldSchema, savePayloadSchema, submitSchema, updatePartFieldSchema, type EditablePartField,
} from "@/lib/costing/schemas";
import * as parts from "@/server/repositories/parts";
import * as quotes from "@/server/repositories/quotes";
import * as workflow from "@/server/repositories/workflow";
import { listAllRates } from "@/server/repositories/rates";

export type ServiceResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string };
export const fail = (error: string, field?: string): { ok: false; error: string; field?: string } => ({ ok: false, error, field });

/** Turns AuthError into a result so callers always get a plain object. Anything else is a real bug and rethrows. */
export async function guarded<T extends object>(
  user: SessionUser | null,
  permission: Permission,
  run: (user: SessionUser) => Promise<ServiceResult<T>>,
): Promise<ServiceResult<T>> {
  try {
    return await run(authorize(user, permission));
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message);
    throw error;
  }
}

/** Which of the four part fields the submitted form changes compared with what is stored. */
export function changedPartFields(stored: parts.StoredPartValues, form: CostingForm): EditablePartField[] {
  const changed: EditablePartField[] = [];
  const numberDiffers = (a: string | number | null, b: string) => a === null || Number(a) !== Number(b);
  if (stored.materialCode !== form.materialCode) changed.push("materialCode");
  if (numberDiffers(stored.grossWeightKg, form.grossWeightKg)) changed.push("grossWeightKg");
  if (numberDiffers(stored.netWeightKg, form.netWeightKg)) changed.push("netWeightKg");
  if (numberDiffers(stored.annualVolume, form.annualVolume)) changed.push("annualVolume");
  return changed;
}

/**
 * Saves a new quote version. The price is recomputed here from the database rates and the
 * submitted inputs; nothing the browser calculated is trusted or stored.
 */
export function saveQuoteVersion(user: SessionUser | null, raw: unknown) {
  return guarded<{ quoteId: string; version: number }>(user, "quote:save", async (u) => {
    const parsed = savePayloadSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Some values are not valid");
    const { partId, form } = parsed.data;

    const [stored, rates] = await Promise.all([parts.getPartValues(partId), listAllRates()]);
    if (!stored) return fail("This part no longer exists.");

    const result = computeCosting(form, rates);
    if (!result.ok) return fail(result.message, result.field);

    const { rateRowIds, ratesSnapshot } = snapshotFor(result, form.quotedOn);
    try {
      const saved = await quotes.saveVersion({
        partId,
        userId: u.id,
        form,
        volumeTiers: serializeTiers(result.cost),
        ratesSnapshot,
        rateRowIds,
        annualValue: result.cost.baseAnnualValue.toFixed(2),
        requiresApproval: result.cost.requiresApproval,
        changedPartFields: changedPartFields(stored, form),
      });
      return { ok: true, quoteId: saved.id, version: saved.version };
    } catch (error) {
      if (error instanceof quotes.VersionConflictError) return fail("Someone saved at the same moment. Save again.");
      throw error;
    }
  });
}

/** A person typed or corrected a part value. Net weight may never exceed gross. */
export function updatePartField(user: SessionUser | null, raw: unknown) {
  return guarded(user, "rfq:update", async (u) => {
    const parsed = updatePartFieldSchema.safeParse(raw);
    if (!parsed.success) return fail("Enter a valid value.");
    const { partId, field, value } = parsed.data;

    const stored = await parts.getPartValues(partId);
    if (!stored) return fail("This part no longer exists.");
    if (field === "grossWeightKg" || field === "netWeightKg") {
      const gross = field === "grossWeightKg" ? value : stored.grossWeightKg;
      const net = field === "netWeightKg" ? value : stored.netWeightKg;
      if (gross !== null && net !== null && Number(net) > Number(gross)) return fail("Net weight cannot exceed gross weight.", field);
    }
    await parts.applyManualField(partId, field, value, u.id);
    return { ok: true };
  });
}

export function acceptPartField(user: SessionUser | null, raw: unknown) {
  return guarded(user, "rfq:update", async (u) => {
    const parsed = acceptFieldSchema.safeParse(raw);
    if (!parsed.success) return fail("Unknown field.");
    const accepted = await parts.acceptAiField(parsed.data.partId, parsed.data.field, u.id);
    return accepted ? { ok: true } : fail("There is nothing to accept for this field.");
  });
}

/** Submits a saved version: blocked while any AI-filled value is unaccepted. */
/** Atomic: the state check, status change, RFQ update and audit entry happen in one locked transaction. */
export function submitQuote(user: SessionUser | null, raw: unknown) {
  return guarded<{ status: "pending_approval" | "ready_to_send" }>(user, "quote:submit", async (u) => {
    const parsed = submitSchema.safeParse(raw);
    if (!parsed.success) return fail("Unknown quote.");
    const result = await workflow.submitQuoteAtomic(parsed.data.quoteId, u.id);
    return result.ok ? { ok: true, status: result.status } : fail(result.message);
  });
}
