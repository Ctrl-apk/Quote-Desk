import type { CostingForm, RoutingRowForm } from "@/lib/costing/form";
import type { FieldSource } from "@/lib/costing/fields";
import type { EditablePartField } from "@/lib/costing/schemas";
import type { RfqStatusValue } from "@/lib/rfq/overdue";
import type { QuoteStatusValue } from "@/lib/quote/submit";
import { getDb } from "@/server/db";

export interface FieldState {
  source: FieldSource;
  aiFilled: boolean;
  accepted: boolean;
}

export interface QuoteSummary {
  id: string;
  version: number;
  status: QuoteStatusValue;
  annualValue: string;
  requiresApproval: boolean;
  createdAt: string;
  createdBy: string;
}

export interface PartForCosting {
  id: string;
  name: string;
  rfq: { id: string; rfqNo: string; customer: string; status: RfqStatusValue; dueDate: string; owner: string };
  materialCode: string | null;
  grossWeightKg: string | null;
  netWeightKg: string | null;
  annualVolume: number | null;
  setupCost: string;
  toolingCost: string;
  routing: RoutingRowForm[];
  fields: Partial<Record<EditablePartField, FieldState>>;
  /** Inputs of the most recent saved version, if any. */
  latestInputs: CostingForm | null;
  versions: QuoteSummary[];
}

export async function getPartForCosting(rfqId: string, partId: string): Promise<PartForCosting | null> {
  const part = await getDb().part.findFirst({
    where: { id: partId, rfqId },
    include: {
      rfq: { include: { customer: true, owner: true } },
      routing: { orderBy: { seq: "asc" } },
      fields: true,
      quotes: { orderBy: { version: "desc" }, take: 10, include: { createdBy: { select: { name: true } } } },
    },
  });
  if (!part) return null;

  const fields: PartForCosting["fields"] = {};
  for (const f of part.fields) fields[f.field as EditablePartField] = { source: f.source, aiFilled: f.aiFilled, accepted: f.accepted };

  const latest = part.quotes[0];
  return {
    id: part.id,
    name: part.name,
    rfq: {
      id: part.rfq.id,
      rfqNo: part.rfq.rfqNo,
      customer: part.rfq.customer.name,
      status: part.rfq.status,
      dueDate: part.rfq.dueDate.toISOString().slice(0, 10),
      owner: part.rfq.owner.name,
    },
    materialCode: part.materialCode,
    grossWeightKg: part.grossWeightKg?.toString() ?? null,
    netWeightKg: part.netWeightKg?.toString() ?? null,
    annualVolume: part.annualVolume,
    setupCost: part.setupCost.toString(),
    toolingCost: part.toolingCost.toString(),
    routing: part.routing.map((r) => ({ operation: r.operation, machineCode: r.machineCode, cycleTimeMin: r.cycleTimeMin.toString() })),
    fields,
    latestInputs: latest ? (latest.inputs as unknown as CostingForm) : null,
    versions: part.quotes.map((q) => ({
      id: q.id,
      version: q.version,
      status: q.status,
      annualValue: q.annualValue.toFixed(2),
      requiresApproval: q.requiresApproval,
      createdAt: q.createdAt.toISOString(),
      createdBy: q.createdBy.name,
    })),
  };
}

export interface StoredPartValues {
  materialCode: string | null;
  grossWeightKg: string | null;
  netWeightKg: string | null;
  annualVolume: number | null;
}

export async function getPartValues(partId: string): Promise<StoredPartValues | null> {
  const part = await getDb().part.findUnique({
    where: { id: partId },
    select: { materialCode: true, grossWeightKg: true, netWeightKg: true, annualVolume: true },
  });
  if (!part) return null;
  return {
    materialCode: part.materialCode,
    grossWeightKg: part.grossWeightKg?.toString() ?? null,
    netWeightKg: part.netWeightKg?.toString() ?? null,
    annualVolume: part.annualVolume,
  };
}

/** A person typed or corrected this value: store it and mark it manual and accepted. */
export async function applyManualField(partId: string, field: EditablePartField, value: string, userId: string): Promise<void> {
  const db = getDb();
  const data = field === "annualVolume" ? { annualVolume: Number(value) } : { [field]: value };
  await db.$transaction(async (tx) => {
    const before = await tx.part.findUnique({ where: { id: partId }, select: { materialCode: true, grossWeightKg: true, netWeightKg: true, annualVolume: true } });
    await tx.part.update({ where: { id: partId }, data });
    await tx.partField.upsert({
      where: { partId_field: { partId, field } },
      update: { source: "manual", aiFilled: false, accepted: true },
      create: { partId, field, source: "manual", aiFilled: false, accepted: true },
    });
    await tx.auditLog.create({ data: { userId, action: "part.update", entity: "Part", entityId: partId, meta: { field, from: before?.[field]?.toString() ?? null, to: value } } });
  });
}

/** Marks an AI-filled value as accepted. Returns false when there is nothing to accept. */
export async function acceptAiField(partId: string, field: EditablePartField, userId: string): Promise<boolean> {
  return getDb().$transaction(async (tx) => {
    const result = await tx.partField.updateMany({ where: { partId, field, aiFilled: true, accepted: false }, data: { accepted: true } });
    if (result.count === 0) return false;
    await tx.auditLog.create({ data: { userId, action: "part.accept", entity: "Part", entityId: partId, meta: { field } } });
    return true;
  });
}

export async function listUnacceptedFields(partId: string): Promise<EditablePartField[]> {
  const rows = await getDb().partField.findMany({ where: { partId, aiFilled: true, accepted: false }, select: { field: true } });
  return rows.map((r) => r.field as EditablePartField);
}

export async function partExists(partId: string): Promise<boolean> {
  return (await getDb().part.count({ where: { id: partId } })) > 0;
}
