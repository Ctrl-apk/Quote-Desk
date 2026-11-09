import type { Prisma } from "@prisma/client";
import type { CreateRfqInput, PartDraft } from "@/lib/rfq/manage";
import { canEditRfq, canRemovePart } from "@/lib/rfq/manage";
import type { RfqStatusValue } from "@/lib/rfq/overdue";
import { getDb } from "@/server/db";
import { allocateRfqNo } from "./rfq-no";

type Tx = Prisma.TransactionClient;
export type Refusal = { ok: false; message: string };

const FIELDS = ["materialCode", "grossWeightKg", "netWeightKg", "annualVolume"] as const;

/** "manual" values were typed by a person and count as accepted. "excel" values were read from a customer's file and wait for acceptance. */
export type PartSource = "manual" | "excel";

async function insertPart(tx: Tx, rfqId: string, p: PartDraft, source: PartSource = "manual") {
  const part = await tx.part.create({
    data: {
      rfqId, name: p.name,
      partNumber: p.partNumber || null,
      drawingRef: p.drawingRef || null,
      materialCode: p.materialCode || null,
      grossWeightKg: p.grossWeightKg || null,
      netWeightKg: p.netWeightKg || null,
      annualVolume: p.annualVolume ? Number(p.annualVolume) : null,
    },
  });
  const fromFile = source === "excel";
  for (const f of FIELDS) if (p[f]) await tx.partField.create({ data: { partId: part.id, field: f, source, aiFilled: fromFile, accepted: !fromFile } });
  return part;
}

/** Locks the RFQ row so edits and status changes for the same RFQ run one after another. */
async function lockRfq(tx: Tx, rfqId: string): Promise<RfqStatusValue | null> {
  const rows = await tx.$queryRaw<{ status: RfqStatusValue }[]>`SELECT "status" FROM "Rfq" WHERE "id" = ${rfqId} FOR UPDATE`;
  return rows[0]?.status ?? null;
}

export async function createRfqManual(input: CreateRfqInput, ownerId: string, today: string, source: PartSource = "manual"): Promise<{ rfqId: string; rfqNo: string; partIds: string[] }> {
  const db = getDb();
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const rfqNo = await allocateRfqNo(tx, today);
        const customer = await tx.customer.upsert({ where: { name: input.customer }, update: {}, create: { name: input.customer } });
        const rfq = await tx.rfq.create({ data: { rfqNo, customerId: customer.id, ownerId, status: "estimating", dueDate: new Date(`${input.dueDate}T00:00:00Z`) } });
        const partIds: string[] = [];
        for (const p of input.parts) partIds.push((await insertPart(tx, rfq.id, p, source)).id);
        await tx.auditLog.create({ data: { userId: ownerId, action: "rfq.create", entity: "Rfq", entityId: rfq.id, meta: { rfqNo, parts: partIds.length, viaIntake: source !== "manual", source } } });
        return { rfqId: rfq.id, rfqNo, partIds };
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002" && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("Could not allocate an RFQ number");
}

export interface RfqDetail {
  id: string;
  rfqNo: string;
  customer: string;
  owner: string;
  status: RfqStatusValue;
  lostReason: string | null;
  dueDate: string;
  createdAt: string;
  parts: { id: string; name: string; partNumber: string | null; drawingRef: string | null; materialCode: string | null; grossWeightKg: string | null; netWeightKg: string | null; annualVolume: number | null; latest: { id: string; version: number; status: string; annualValue: string; requiresApproval: boolean } | null; quoteCount: number }[];
}

export async function getRfqDetail(rfqId: string): Promise<RfqDetail | null> {
  const rfq = await getDb().rfq.findUnique({
    where: { id: rfqId },
    include: {
      customer: true, owner: { select: { name: true } },
      parts: { orderBy: { id: "asc" }, include: { quotes: { orderBy: { version: "desc" }, select: { id: true, version: true, status: true, annualValue: true, requiresApproval: true } } } },
    },
  });
  if (!rfq) return null;
  return {
    id: rfq.id, rfqNo: rfq.rfqNo, customer: rfq.customer.name, owner: rfq.owner.name, status: rfq.status, lostReason: rfq.lostReason,
    dueDate: rfq.dueDate.toISOString().slice(0, 10), createdAt: rfq.createdAt.toISOString(),
    parts: rfq.parts.map((p) => {
      const l = p.quotes[0];
      return {
        id: p.id, name: p.name, partNumber: p.partNumber, drawingRef: p.drawingRef, materialCode: p.materialCode, grossWeightKg: p.grossWeightKg?.toString() ?? null, netWeightKg: p.netWeightKg?.toString() ?? null, annualVolume: p.annualVolume,
        latest: l ? { id: l.id, version: l.version, status: l.status, annualValue: l.annualValue.toFixed(2), requiresApproval: l.requiresApproval } : null,
        quoteCount: p.quotes.length,
      };
    }),
  };
}

export async function updateRfq(input: { rfqId: string; customer: string; dueDate: string }, userId: string): Promise<{ ok: true } | Refusal> {
  return getDb().$transaction(async (tx) => {
    const status = await lockRfq(tx, input.rfqId);
    if (!status) return { ok: false, message: "This RFQ no longer exists." } as Refusal;
    const gate = canEditRfq(status);
    if (!gate.ok) return gate;
    const before = await tx.rfq.findUniqueOrThrow({ where: { id: input.rfqId }, include: { customer: true } });
    const customer = await tx.customer.upsert({ where: { name: input.customer }, update: {}, create: { name: input.customer } });
    await tx.rfq.update({ where: { id: input.rfqId }, data: { customerId: customer.id, dueDate: new Date(`${input.dueDate}T00:00:00Z`) } });
    await tx.auditLog.create({ data: { userId, action: "rfq.update", entity: "Rfq", entityId: input.rfqId, meta: { from: { customer: before.customer.name, dueDate: before.dueDate.toISOString().slice(0, 10) }, to: { customer: input.customer, dueDate: input.dueDate } } } });
    return { ok: true as const };
  });
}

export async function addPart(rfqId: string, part: PartDraft, userId: string, maxParts: number): Promise<{ ok: true; partId: string } | Refusal> {
  return getDb().$transaction(async (tx) => {
    const status = await lockRfq(tx, rfqId);
    if (!status) return { ok: false, message: "This RFQ no longer exists." } as Refusal;
    const gate = canEditRfq(status);
    if (!gate.ok) return gate;
    if ((await tx.part.count({ where: { rfqId } })) >= maxParts) return { ok: false, message: `An RFQ can have at most ${maxParts} parts.` } as Refusal;
    const created = await insertPart(tx, rfqId, part);
    await tx.auditLog.create({ data: { userId, action: "part.add", entity: "Part", entityId: created.id, meta: { rfqId, name: part.name } } });
    return { ok: true as const, partId: created.id };
  });
}

export async function renamePart(partId: string, name: string, userId: string): Promise<{ ok: true } | Refusal> {
  return getDb().$transaction(async (tx) => {
    const part = await tx.part.findUnique({ where: { id: partId }, select: { rfqId: true, name: true } });
    if (!part) return { ok: false, message: "This part no longer exists." } as Refusal;
    const status = await lockRfq(tx, part.rfqId);
    const gate = canEditRfq(status ?? "lost");
    if (!gate.ok) return gate;
    await tx.part.update({ where: { id: partId }, data: { name } });
    await tx.auditLog.create({ data: { userId, action: "part.rename", entity: "Part", entityId: partId, meta: { from: part.name, to: name } } });
    return { ok: true as const };
  });
}

export async function removePart(partId: string, userId: string): Promise<{ ok: true } | Refusal> {
  return getDb().$transaction(async (tx) => {
    const part = await tx.part.findUnique({ where: { id: partId }, select: { rfqId: true, name: true } });
    if (!part) return { ok: false, message: "This part no longer exists." } as Refusal;
    const status = await lockRfq(tx, part.rfqId);
    const gate = canEditRfq(status ?? "lost");
    if (!gate.ok) return gate;
    const [partCount, quoteCount] = await Promise.all([tx.part.count({ where: { rfqId: part.rfqId } }), tx.quote.count({ where: { partId } })]);
    const rule = canRemovePart({ partCount, quoteCount });
    if (!rule.ok) return rule;
    await tx.part.delete({ where: { id: partId } });
    await tx.auditLog.create({ data: { userId, action: "part.remove", entity: "Part", entityId: partId, meta: { rfqId: part.rfqId, name: part.name } } });
    return { ok: true as const };
  });
}
