import type { Prisma } from "@prisma/client";
import { todayIst } from "@/lib/format/dates";
import type { RfqFilters } from "@/lib/rfq/filters";
import type { RfqStatusValue } from "@/lib/rfq/overdue";
import { getDb } from "@/server/db";

export interface RfqRow {
  id: string;
  rfqNo: string;
  customer: string;
  owner: string;
  status: RfqStatusValue;
  lostReason: string | null;
  /** YYYY-MM-DD */
  dueDate: string;
  /** YYYY-MM-DD (India time) the RFQ was registered. */
  receivedOn: string;
  partCount: number;
  firstPart: { id: string; name: string } | null;
}

export const REGISTER_LIMIT = 200;

/** The RFQ number is always the final tiebreak, so the order is stable. */
export function orderByFor(f: Pick<RfqFilters, "sort" | "dir">): Prisma.RfqOrderByWithRelationInput[] {
  const tie: Prisma.RfqOrderByWithRelationInput = { rfqNo: f.sort === "rfq" ? f.dir : "asc" };
  switch (f.sort) {
    case "received": return [{ createdAt: f.dir }, tie];
    case "customer": return [{ customer: { name: f.dir } }, tie];
    case "rfq": return [tie];
    default: return [{ dueDate: f.dir }, tie];
  }
}

export async function listRfqs(filters: RfqFilters, userId: string): Promise<{ rows: RfqRow[]; truncated: boolean }> {
  const where: Prisma.RfqWhereInput = {
    ...(filters.mine ? { ownerId: userId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q
      ? {
          OR: [
            { rfqNo: { contains: filters.q, mode: "insensitive" } },
            { customer: { name: { contains: filters.q, mode: "insensitive" } } },
            { parts: { some: { name: { contains: filters.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const rows = await getDb().rfq.findMany({
    where,
    orderBy: orderByFor(filters),
    take: REGISTER_LIMIT + 1,
    select: {
      id: true, rfqNo: true, status: true, lostReason: true, dueDate: true, createdAt: true,
      customer: { select: { name: true } },
      owner: { select: { name: true } },
      parts: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
  return {
    truncated: rows.length > REGISTER_LIMIT,
    rows: rows.slice(0, REGISTER_LIMIT).map((r) => ({
      id: r.id,
      rfqNo: r.rfqNo,
      customer: r.customer.name,
      owner: r.owner.name,
      status: r.status,
      lostReason: r.lostReason,
      dueDate: r.dueDate.toISOString().slice(0, 10),
      receivedOn: todayIst(r.createdAt),
      partCount: r.parts.length,
      firstPart: r.parts[0] ?? null,
    })),
  };
}

export interface RfqStats {
  estimating: number;
  overdue: number;
  sent: number;
  closed: number;
}

/** Whole-register counts, unaffected by the filters, shown above the table. */
export async function rfqStats(today: string): Promise<RfqStats> {
  const db = getDb();
  const [byStatus, overdue] = await Promise.all([
    db.rfq.groupBy({ by: ["status"], _count: { _all: true } }),
    db.rfq.count({ where: { status: "estimating", dueDate: { lt: new Date(`${today}T00:00:00Z`) } } }),
  ]);
  const n = (s: RfqStatusValue) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return { estimating: n("estimating"), overdue, sent: n("sent"), closed: n("won") + n("lost") };
}
