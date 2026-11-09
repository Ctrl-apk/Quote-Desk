import type { Prisma } from "@prisma/client";
import { SEARCH_LIMIT, rankPastQuotes, weightRange, type PastQuoteQuery } from "@/lib/import/search";
import type { ParsedPastQuote } from "@/lib/import/past-quotes";
import { getDb } from "@/server/db";

export interface PastQuoteRow {
  id: string;
  customer: string;
  partName: string;
  partNumber: string | null;
  materialCode: string;
  grossWeightKg: string;
  routing: { operation: string; machineCode: string; cycleTimeMin: string }[];
  pricePerUnit: string;
  quoteRef: string;
  quotedOn: string;
}

export async function searchPastQuotes(query: PastQuoteQuery): Promise<{ rows: PastQuoteRow[]; total: number }> {
  const where: Prisma.PastQuoteWhereInput = {
    ...(query.material ? { materialCode: { equals: query.material, mode: "insensitive" } } : {}),
    ...(query.weight ? { grossWeightKg: { gte: weightRange(query.weight).min, lte: weightRange(query.weight).max } } : {}),
    ...(query.from || query.to
      ? { quotedOn: { ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}), ...(query.to ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}) } }
      : {}),
    ...(query.q
      ? {
          OR: [
            { customer: { contains: query.q, mode: "insensitive" } },
            { partName: { contains: query.q, mode: "insensitive" } },
            { partNumber: { contains: query.q, mode: "insensitive" } },
            { quoteRef: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const db = getDb();
  const [found, total] = await Promise.all([db.pastQuote.findMany({ where, orderBy: { quotedOn: "desc" }, take: 500 }), db.pastQuote.count()]);
  const mapped = found.map((r) => ({
    id: r.id, customer: r.customer, partName: r.partName, partNumber: r.partNumber, materialCode: r.materialCode, grossWeightKg: r.grossWeightKg.toFixed(4),
    routing: r.routing as PastQuoteRow["routing"], pricePerUnit: r.pricePerUnit.toFixed(2), quoteRef: r.quoteRef, quotedOn: r.quotedOn.toISOString().slice(0, 10),
  }));
  return { rows: rankPastQuotes(mapped, query.weight).slice(0, SEARCH_LIMIT), total };
}

export async function distinctMaterials(): Promise<string[]> {
  return (await getDb().pastQuote.findMany({ distinct: ["materialCode"], select: { materialCode: true }, orderBy: { materialCode: "asc" } })).map((r) => r.materialCode);
}

/** Keys that already exist, so the preview can say how many rows are new. */
export async function existingKeys(keys: string[]): Promise<Set<string>> {
  const rows = await getDb().pastQuote.findMany({ where: { importKey: { in: keys } }, select: { importKey: true } });
  return new Set(rows.map((r) => r.importKey));
}

/** Inserts new rows only. A row already present (same import key) is skipped, so a repeat upload changes nothing. */
export async function insertPastQuotes(rows: ParsedPastQuote[], userId: string): Promise<number> {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const res = await tx.pastQuote.createMany({
      skipDuplicates: true,
      data: rows.map((r) => ({
        importKey: r.importKey, customer: r.customer, partName: r.partName, partNumber: r.partNumber, materialCode: r.materialCode, grossWeightKg: r.grossWeightKg,
        routing: r.routing as unknown as Prisma.InputJsonValue, pricePerUnit: r.pricePerUnit, quoteRef: r.quoteRef, quotedOn: new Date(`${r.quotedOn}T00:00:00Z`),
      })),
    });
    await tx.auditLog.create({ data: { userId, action: "pastquotes.import", entity: "PastQuote", entityId: "batch", meta: { submitted: rows.length, inserted: res.count } } });
    return res.count;
  });
}
