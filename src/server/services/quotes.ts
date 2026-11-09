import { type SessionUser } from "@/lib/auth";
import { decisionSchema, outcomeSchema, sendSchema } from "@/lib/costing/schemas";
import * as workflow from "@/server/repositories/workflow";
import { guarded, fail } from "./costing";

// Each function: role check, input check, then one atomic repository call that re-reads the state under a lock.

/** Sales head approves or rejects a quote that crossed the threshold. */
export function decideQuote(user: SessionUser | null, raw: unknown) {
  return guarded<{ status: "approved" | "rejected" }>(user, "quote:approve", async (u) => {
    const parsed = decisionSchema.safeParse(raw);
    if (!parsed.success) return fail("Unknown quote or action.");
    const result = await workflow.decideQuoteAtomic(parsed.data.quoteId, u.id, parsed.data.action, parsed.data.comment);
    return result.ok ? { ok: true, status: result.status } : fail(result.message);
  });
}

/** Sales head only: sends an approved quote, or one that needed no approval. Marks the RFQ sent and enables the PDF. */
export function sendQuote(user: SessionUser | null, raw: unknown) {
  return guarded(user, "quote:send", async (u) => {
    const parsed = sendSchema.safeParse(raw);
    if (!parsed.success) return fail("Unknown quote.");
    const result = await workflow.sendQuoteAtomic(parsed.data.quoteId, u.id);
    return result.ok ? { ok: true } : fail(result.message);
  });
}

/** Won or lost. Estimators own the customer follow-up, so this uses rfq:update. */
export function markOutcome(user: SessionUser | null, raw: unknown) {
  return guarded(user, "rfq:update", async (u) => {
    const parsed = outcomeSchema.safeParse(raw);
    if (!parsed.success) return fail("Unknown quote or outcome.");
    const result = await workflow.markOutcomeAtomic(parsed.data.quoteId, u.id, parsed.data.outcome, parsed.data.reason);
    return result.ok ? { ok: true } : fail(result.message);
  });
}
export type { ServiceResult as ServiceResultLike } from "./costing";
