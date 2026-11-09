import type { MachineRateRow, MaterialRateRow, OverheadRateRow } from "@/lib/rates";
import { getDb } from "@/server/db";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface AllRates {
  materials: MaterialRateRow[];
  machines: MachineRateRow[];
  overhead: OverheadRateRow[];
}

/**
 * Every rate row, mapped to the plain strings the pure lookup code works on.
 * The rate tables are small (a few rows per code), so one read serves both the
 * live costing screen and the server-side recomputation.
 */
export async function listAllRates(): Promise<AllRates> {
  const db = getDb();
  const [materials, machines, overhead] = await Promise.all([
    db.rateMaterial.findMany({ orderBy: [{ materialCode: "asc" }, { effectiveFrom: "asc" }] }),
    db.rateMachine.findMany({ orderBy: [{ machineCode: "asc" }, { effectiveFrom: "asc" }] }),
    db.rateOverhead.findMany({ orderBy: [{ category: "asc" }, { effectiveFrom: "asc" }] }),
  ]);
  return {
    materials: materials.map((r) => ({ id: r.id, materialCode: r.materialCode, ratePerKg: r.ratePerKg.toFixed(4), scrapRecoveryPerKg: r.scrapRecoveryPerKg.toFixed(4), effectiveFrom: iso(r.effectiveFrom) })),
    machines: machines.map((r) => ({ id: r.id, machineCode: r.machineCode, hourRate: r.hourRate.toFixed(2), efficiency: r.efficiency.toFixed(4), effectiveFrom: iso(r.effectiveFrom) })),
    overhead: overhead.map((r) => ({ id: r.id, category: r.category, percent: r.percent.toFixed(3), effectiveFrom: iso(r.effectiveFrom) })),
  };
}

/** The most recent rate date that is already in force today, shown in the top bar. */
export async function latestRateDateInForce(today: string): Promise<string | null> {
  const rates = await listAllRates();
  const dates = [...rates.materials, ...rates.machines, ...rates.overhead].map((r) => r.effectiveFrom).filter((d) => d <= today);
  return dates.sort().at(-1) ?? null;
}

export type NewRate =
  | { kind: "material"; code: string; effectiveFrom: string; ratePerKg: string; scrapRecoveryPerKg: string }
  | { kind: "machine"; code: string; effectiveFrom: string; hourRate: string; efficiency: string }
  | { kind: "overhead"; code: string; effectiveFrom: string; percent: string };

export class RateExistsError extends Error {}

/** Appends one rate row and an audit entry together. There is deliberately no update or delete here. */
export async function addRate(rate: NewRate, userId: string): Promise<void> {
  const db = getDb();
  const effectiveFrom = new Date(`${rate.effectiveFrom}T00:00:00Z`);
  const insert =
    rate.kind === "material"
      ? db.rateMaterial.create({ data: { materialCode: rate.code, ratePerKg: rate.ratePerKg, scrapRecoveryPerKg: rate.scrapRecoveryPerKg, effectiveFrom, createdById: userId } })
      : rate.kind === "machine"
        ? db.rateMachine.create({ data: { machineCode: rate.code, hourRate: rate.hourRate, efficiency: rate.efficiency, effectiveFrom, createdById: userId } })
        : db.rateOverhead.create({ data: { category: rate.code, percent: rate.percent, effectiveFrom, createdById: userId } });
  try {
    await db.$transaction([
      insert,
      db.auditLog.create({ data: { userId, action: "rate.add", entity: `Rate${rate.kind}`, entityId: rate.code, meta: { ...rate } } }),
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new RateExistsError();
    throw error;
  }
}

/** Who added each row, for the history table. */
export async function listRateAuthors(): Promise<Record<string, string>> {
  const db = getDb();
  const [m, k, o] = await Promise.all([
    db.rateMaterial.findMany({ select: { id: true, createdBy: { select: { name: true } } } }),
    db.rateMachine.findMany({ select: { id: true, createdBy: { select: { name: true } } } }),
    db.rateOverhead.findMany({ select: { id: true, createdBy: { select: { name: true } } } }),
  ]);
  return Object.fromEntries([...m, ...k, ...o].map((r) => [r.id, r.createdBy.name]));
}
