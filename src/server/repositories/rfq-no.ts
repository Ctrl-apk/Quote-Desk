import type { Prisma } from "@prisma/client";
import { nextRfqNo } from "@/lib/intake";

/**
 * Next RFQ number for the month. A transaction-level advisory lock makes concurrent creations
 * take their numbers one after another, so they never collide; the unique index on rfqNo stays as the backstop.
 */
export async function allocateRfqNo(tx: Prisma.TransactionClient, today: string): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rfq-number'))`;
  const existing = await tx.rfq.findMany({ where: { rfqNo: { startsWith: `RFQ-${today.slice(2, 4)}${today.slice(5, 7)}-` } }, select: { rfqNo: true } });
  return nextRfqNo(existing.map((r) => r.rfqNo), today);
}
