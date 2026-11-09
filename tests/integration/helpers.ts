import { randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import type { CostingForm } from "@/lib/costing/form";
import { MACHINE_RATES, MATERIAL_RATES, OVERHEAD_RATES } from "../../prisma/seed-data";
import { getDb } from "@/server/db";
import { saveQuoteVersion } from "@/server/services/costing";

export const db = () => getDb();
export const uid = () => randomUUID().slice(0, 8);
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function makeUser(role: "estimator" | "sales_head", password?: string): Promise<SessionUser & { password?: string }> {
  const tag = uid();
  const email = `${role}-${tag}@test.example`;
  const user = await db().user.create({ data: { email, name: `${role} ${tag}`, role, passwordHash: await hashPassword(password ?? `pw-${tag}-Xy9`) } });
  return { id: user.id, email, name: user.name, role, password };
}

/** The demo rate masters, inserted once (rows that already exist are skipped, like the real seed). */
export async function ensureRates(): Promise<void> {
  const head = await makeUser("sales_head");
  const createdById = head.id;
  await db().rateMaterial.createMany({ data: MATERIAL_RATES.map((r) => ({ ...r, effectiveFrom: asDate(r.effectiveFrom), createdById })), skipDuplicates: true });
  await db().rateMachine.createMany({ data: MACHINE_RATES.map((r) => ({ ...r, effectiveFrom: asDate(r.effectiveFrom), createdById })), skipDuplicates: true });
  await db().rateOverhead.createMany({ data: OVERHEAD_RATES.map((r) => ({ ...r, effectiveFrom: asDate(r.effectiveFrom), createdById })), skipDuplicates: true });
}

export const BIG_VOLUME = "2000000"; // far above the ₹25,00,000 threshold
export const SMALL_VOLUME = "1000"; // far below it

export function formFor(annualVolume: string, over: Partial<CostingForm> = {}): CostingForm {
  return {
    quotedOn: "2026-11-05", materialCode: "EN8", grossWeightKg: "0.6100", netWeightKg: "0.5200", annualVolume,
    setupCost: "50000.00", toolingCost: "150000.00",
    routing: [{ operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "3.2" }],
    scrapPercent: "2", overheadPercent: "12", packingPerUnit: "1.50", freightPerUnit: ["2.00", "2.00", "2.00"],
    markupPercent: "10", gstPercent: "18",
    ...over,
  };
}

/** An RFQ with one part, written directly so tests control every value. */
export async function makePart(owner: { id: string }, over: { annualVolume?: number; materialCode?: string; aiUnaccepted?: string[] } = {}) {
  const customer = await db().customer.create({ data: { name: `Customer ${uid()}` } });
  const rfq = await db().rfq.create({
    data: {
      rfqNo: `T-${uid()}`, customerId: customer.id, ownerId: owner.id, dueDate: asDate("2026-12-01"),
      parts: {
        create: {
          name: `Part ${uid()}`, materialCode: over.materialCode ?? "EN8", grossWeightKg: "0.6100", netWeightKg: "0.5200",
          annualVolume: over.annualVolume ?? 1000, setupCost: "50000", toolingCost: "150000",
          routing: { create: [{ seq: 1, operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "3.2" }] },
          fields: { create: (over.aiUnaccepted ?? []).map((field) => ({ field, source: "email", aiFilled: true, accepted: false })) },
        },
      },
    },
    include: { parts: true },
  });
  return { rfqId: rfq.id, partId: rfq.parts[0]!.id, customerId: customer.id };
}

export async function savedQuote(estimator: SessionUser, partId: string, volume: string, over: Partial<CostingForm> = {}) {
  const res = await saveQuoteVersion(estimator, { partId, form: formFor(volume, over) });
  if (!res.ok) throw new Error(`saveQuoteVersion failed: ${res.error}`);
  return { quoteId: res.quoteId, version: res.version };
}

export async function auditFor(entity: string, entityId: string) {
  return db().auditLog.findMany({ where: { entity, entityId }, orderBy: { at: "asc" } });
}

/** Runs SQL that is expected to fail and returns the Postgres error message. */
export async function sqlError(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return error instanceof Error ? `${error.message} ${(error as { cause?: { message?: string } }).cause?.message ?? ""}` : String(error);
  }
  return "NO_ERROR";
}
