import type { Prisma } from "@prisma/client";
import type { CostingForm, SerializedTier } from "@/lib/costing/form";
import type { RfqStatusValue } from "@/lib/rfq/overdue";
import type { EditablePartField } from "@/lib/costing/schemas";
import type { QuoteStatusValue } from "@/lib/quote/submit";
import type { RateRowIds, RatesSnapshot } from "@/lib/rates";
import { getDb } from "@/server/db";
import { lockPart } from "./workflow";

export interface SaveVersionInput {
  partId: string;
  userId: string;
  form: CostingForm;
  volumeTiers: unknown;
  ratesSnapshot: RatesSnapshot;
  rateRowIds: RateRowIds;
  annualValue: string;
  requiresApproval: boolean;
  /** Part fields whose form value differs from the stored one: written as manual, accepted edits. */
  changedPartFields: EditablePartField[];
}

/** Thrown when two saves race for the same version number. */
export class VersionConflictError extends Error {}

/**
 * Saves a quote version and the routing and part values it was priced on, atomically.
 * Rate tables are only read elsewhere; nothing here can touch them.
 */
export async function saveVersion(input: SaveVersionInput): Promise<{ id: string; version: number }> {
  const { form } = input;
  try {
    return await getDb().$transaction(async (tx) => {
      await lockPart(tx, input.partId); // saves, submits and decisions for one part run one at a time
      const latest = await tx.quote.aggregate({ where: { partId: input.partId }, _max: { version: true } });
      const version = (latest._max.version ?? 0) + 1;

      await tx.part.update({
        where: { id: input.partId },
        data: {
          materialCode: form.materialCode,
          grossWeightKg: form.grossWeightKg,
          netWeightKg: form.netWeightKg,
          annualVolume: Number(form.annualVolume),
          setupCost: form.setupCost,
          toolingCost: form.toolingCost,
        },
      });
      for (const field of input.changedPartFields) {
        await tx.partField.upsert({
          where: { partId_field: { partId: input.partId, field } },
          update: { source: "manual", aiFilled: false, accepted: true },
          create: { partId: input.partId, field, source: "manual", aiFilled: false, accepted: true },
        });
      }

      await tx.routingStep.deleteMany({ where: { partId: input.partId } });
      await tx.routingStep.createMany({
        data: form.routing.map((row, i) => ({ partId: input.partId, seq: i + 1, operation: row.operation, machineCode: row.machineCode, cycleTimeMin: row.cycleTimeMin })),
      });

      const quote = await tx.quote.create({
        data: {
          partId: input.partId,
          version,
          status: "draft",
          quotedOn: new Date(`${form.quotedOn}T00:00:00Z`),
          inputs: form as unknown as Prisma.InputJsonValue,
          ratesSnapshot: input.ratesSnapshot as unknown as Prisma.InputJsonValue,
          rateRowIds: input.rateRowIds as unknown as Prisma.InputJsonValue,
          volumeTiers: input.volumeTiers as Prisma.InputJsonValue,
          annualValue: input.annualValue,
          requiresApproval: input.requiresApproval,
          createdById: input.userId,
        },
      });
      await tx.auditLog.create({
        data: { userId: input.userId, action: "quote.save", entity: "Quote", entityId: quote.id, meta: { version, partId: input.partId, annualValue: input.annualValue } },
      });
      return { id: quote.id, version };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new VersionConflictError();
    throw error;
  }
}

export interface QuoteDetail {
  id: string;
  version: number;
  status: QuoteStatusValue;
  quotedOn: string;
  inputs: CostingForm;
  ratesSnapshot: RatesSnapshot;
  tiers: SerializedTier[];
  annualValue: string;
  requiresApproval: boolean;
  approver: string | null;
  approvalComment: string | null;
  decidedAt: string | null;
  createdAt: string;
  createdBy: string;
  isLatest: boolean;
  part: { id: string; name: string };
  rfq: { id: string; rfqNo: string; customer: string; status: RfqStatusValue; dueDate: string; lostReason: string | null };
  trail: { at: string; action: string; by: string | null; meta: unknown }[];
}

export async function getQuoteDetail(quoteId: string): Promise<QuoteDetail | null> {
  const db = getDb();
  const q = await db.quote.findUnique({
    where: { id: quoteId },
    include: { createdBy: { select: { name: true } }, approver: { select: { name: true } }, part: { include: { rfq: { include: { customer: true } } } } },
  });
  if (!q) return null;
  const [latest, trail] = await Promise.all([
    db.quote.aggregate({ where: { partId: q.partId }, _max: { version: true } }),
    db.auditLog.findMany({ where: { entity: "Quote", entityId: quoteId }, orderBy: { at: "asc" }, include: { user: { select: { name: true } } } }),
  ]);
  return {
    id: q.id,
    version: q.version,
    status: q.status,
    quotedOn: q.quotedOn.toISOString().slice(0, 10),
    inputs: q.inputs as unknown as CostingForm,
    ratesSnapshot: q.ratesSnapshot as unknown as RatesSnapshot,
    tiers: q.volumeTiers as unknown as SerializedTier[],
    annualValue: q.annualValue.toFixed(2),
    requiresApproval: q.requiresApproval,
    approver: q.approver?.name ?? null,
    approvalComment: q.approvalComment,
    decidedAt: q.decidedAt?.toISOString() ?? null,
    createdAt: q.createdAt.toISOString(),
    createdBy: q.createdBy.name,
    isLatest: (latest._max.version ?? 0) === q.version,
    part: { id: q.part.id, name: q.part.name },
    rfq: { id: q.part.rfq.id, rfqNo: q.part.rfq.rfqNo, customer: q.part.rfq.customer.name, status: q.part.rfq.status, dueDate: q.part.rfq.dueDate.toISOString().slice(0, 10), lostReason: q.part.rfq.lostReason },
    trail: trail.map((t) => ({ at: t.at.toISOString(), action: t.action, by: t.user?.name ?? null, meta: t.meta })),
  };
}

export interface QuoteListRow {
  id: string;
  version: number;
  status: QuoteStatusValue;
  annualValue: string;
  requiresApproval: boolean;
  createdAt: string;
  createdBy: string;
  rfqNo: string;
  customer: string;
  partName: string;
}

/** Newest first. Superseded versions are included; the status column says where each stands. */
export async function listQuotes(statuses: QuoteStatusValue[] | null, limit = 200): Promise<QuoteListRow[]> {
  const rows = await getDb().quote.findMany({
    where: statuses ? { status: { in: statuses } } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { createdBy: { select: { name: true } }, part: { include: { rfq: { include: { customer: true } } } } },
  });
  return rows.map((q) => ({
    id: q.id, version: q.version, status: q.status, annualValue: q.annualValue.toFixed(2), requiresApproval: q.requiresApproval,
    createdAt: q.createdAt.toISOString(), createdBy: q.createdBy.name, rfqNo: q.part.rfq.rfqNo, customer: q.part.rfq.customer.name, partName: q.part.name,
  }));
}
