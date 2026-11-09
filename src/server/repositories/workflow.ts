import type { Prisma } from "@prisma/client";
import { FIELD_LABELS } from "@/lib/costing/fields";
import type { EditablePartField } from "@/lib/costing/schemas";
import { decideSubmit, type QuoteStatusValue } from "@/lib/quote/submit";
import { decideApproval, decideOutcome, decideSend } from "@/lib/quote/workflow";
import type { RfqStatusValue } from "@/lib/rfq/overdue";
import { getDb } from "@/server/db";

/**
 * Every quote status change runs here, inside one transaction that first locks the part row.
 * Under that lock the state is read fresh, the pure rule from src/lib/quote decides, and the
 * status, the RFQ and the audit entry are written together or not at all. Two requests for
 * the same part therefore run one after the other: the second sees the first's result and is
 * refused by the rule, so there is no double submit, no double decision and no stale approval.
 * The Postgres triggers in migration 3 repeat the transition rules as a second line of defence.
 */

export type Refusal = { ok: false; message: string };
type Tx = Prisma.TransactionClient;

interface QuoteState {
  id: string;
  partId: string;
  rfqId: string;
  version: number;
  status: QuoteStatusValue;
  requiresApproval: boolean;
  isLatest: boolean;
  rfqStatus: RfqStatusValue;
}

const MISSING: Refusal = { ok: false, message: "This quote no longer exists." };

async function lockPart(tx: Tx, partId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Part" WHERE "id" = ${partId} FOR UPDATE`;
}

export { lockPart };

async function readState(tx: Tx, quoteId: string): Promise<QuoteState | null> {
  const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { part: { select: { rfqId: true, rfq: { select: { status: true } } } } } });
  if (!quote) return null;
  const latest = await tx.quote.aggregate({ where: { partId: quote.partId }, _max: { version: true } });
  return {
    id: quote.id,
    partId: quote.partId,
    rfqId: quote.part.rfqId,
    version: quote.version,
    status: quote.status,
    requiresApproval: quote.requiresApproval,
    isLatest: (latest._max.version ?? 0) === quote.version,
    rfqStatus: quote.part.rfq.status,
  };
}

async function withLockedQuote<T extends object>(quoteId: string, run: (tx: Tx, state: QuoteState) => Promise<T | Refusal>): Promise<T | Refusal> {
  return getDb().$transaction(async (tx) => {
    const head = await tx.quote.findUnique({ where: { id: quoteId }, select: { partId: true } });
    if (!head) return MISSING;
    await lockPart(tx, head.partId);
    const state = await readState(tx, quoteId);
    if (!state) return MISSING;
    return run(tx, state);
  });
}

const CHANGED: Refusal = { ok: false, message: "This quote changed while you were working. Reload and check." };

export function submitQuoteAtomic(quoteId: string, userId: string): Promise<{ ok: true; status: "pending_approval" | "ready_to_send" } | Refusal> {
  return withLockedQuote(quoteId, async (tx, state) => {
    const unaccepted = await tx.partField.findMany({ where: { partId: state.partId, aiFilled: true, accepted: false }, select: { field: true } });
    const decision = decideSubmit({
      status: state.status,
      isLatest: state.isLatest,
      requiresApproval: state.requiresApproval,
      unacceptedFields: unaccepted.map((f) => FIELD_LABELS[f.field as EditablePartField] ?? f.field),
    });
    if (!decision.ok) return { ok: false, message: decision.message } as Refusal;
    const moved = await tx.quote.updateMany({ where: { id: state.id, status: "draft" }, data: { status: decision.nextStatus } });
    if (moved.count !== 1) return CHANGED;
    await tx.auditLog.create({ data: { userId, action: "quote.submit", entity: "Quote", entityId: state.id, meta: { status: decision.nextStatus, version: state.version } } });
    return { ok: true as const, status: decision.nextStatus };
  });
}

export function decideQuoteAtomic(quoteId: string, userId: string, action: "approve" | "reject", comment: string): Promise<{ ok: true; status: "approved" | "rejected" } | Refusal> {
  return withLockedQuote(quoteId, async (tx, state) => {
    const decision = decideApproval({ status: state.status, isLatest: state.isLatest, action, comment });
    if (!decision.ok) return { ok: false, message: decision.message } as Refusal;
    const moved = await tx.quote.updateMany({
      where: { id: state.id, status: "pending_approval" },
      data: { status: decision.nextStatus, approverId: userId, approvalComment: decision.comment || null, decidedAt: new Date() },
    });
    if (moved.count !== 1) return CHANGED;
    await tx.auditLog.create({ data: { userId, action: `quote.${decision.nextStatus === "approved" ? "approve" : "reject"}`, entity: "Quote", entityId: state.id, meta: { comment: decision.comment, version: state.version } } });
    return { ok: true as const, status: decision.nextStatus };
  });
}

export function sendQuoteAtomic(quoteId: string, userId: string): Promise<{ ok: true } | Refusal> {
  return withLockedQuote(quoteId, async (tx, state) => {
    const decision = decideSend(state);
    if (!decision.ok) return { ok: false, message: decision.message } as Refusal;
    const moved = await tx.quote.updateMany({ where: { id: state.id, status: { in: ["approved", "ready_to_send"] } }, data: { status: "sent" } });
    if (moved.count !== 1) return CHANGED;
    await tx.rfq.updateMany({ where: { id: state.rfqId, status: "estimating" }, data: { status: "sent" } });
    await tx.auditLog.create({ data: { userId, action: "quote.send", entity: "Quote", entityId: state.id, meta: { version: state.version, from: state.status } } });
    return { ok: true as const };
  });
}

export function markOutcomeAtomic(quoteId: string, userId: string, outcome: "won" | "lost", reason: string): Promise<{ ok: true } | Refusal> {
  return withLockedQuote(quoteId, async (tx, state) => {
    const decision = decideOutcome({ rfqStatus: state.rfqStatus, outcome, reason });
    if (!decision.ok) return { ok: false, message: decision.message } as Refusal;
    const moved = await tx.rfq.updateMany({ where: { id: state.rfqId, status: "sent" }, data: { status: outcome, lostReason: decision.reason } });
    if (moved.count !== 1) return CHANGED;
    await tx.auditLog.create({ data: { userId, action: `rfq.${outcome}`, entity: "Rfq", entityId: state.rfqId, meta: { reason: decision.reason, quoteId: state.id } } });
    return { ok: true as const };
  });
}
