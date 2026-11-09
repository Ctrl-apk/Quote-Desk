import type { CreateFromIntake } from "@/lib/intake";
import { getDb } from "@/server/db";
import { allocateRfqNo } from "./rfq-no";

export async function listCustomerNames(): Promise<string[]> {
  return (await getDb().customer.findMany({ orderBy: { name: "asc" }, select: { name: true } })).map((c) => c.name);
}

const FIELDS = ["materialCode", "grossWeightKg", "netWeightKg", "annualVolume"] as const;

/**
 * Creates the customer (if new), the RFQ and its part together.
 * A value that still equals what the extractor proposed is stored as AI-filled and unaccepted,
 * which blocks submit until a person accepts it. A value the person typed or changed is manual and accepted.
 */
export async function createRfqWithPart(input: CreateFromIntake, ownerId: string, today: string): Promise<{ rfqId: string; partId: string; rfqNo: string }> {
  const db = getDb();
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const rfqNo = await allocateRfqNo(tx, today);
        const customer = await tx.customer.upsert({ where: { name: input.customer }, update: {}, create: { name: input.customer } });
        const rfq = await tx.rfq.create({ data: { rfqNo, customerId: customer.id, ownerId, status: "estimating", dueDate: new Date(`${input.dueDate}T00:00:00Z`), sourceEmail: input.sourceEmail || null } });
        const p = input.part;
        const part = await tx.part.create({
          data: {
            rfqId: rfq.id, name: p.name, partNumber: p.partNumber || null, drawingRef: p.drawingRef || null,
            materialCode: p.materialCode || null,
            grossWeightKg: p.grossWeightKg || null,
            netWeightKg: p.netWeightKg || null,
            annualVolume: p.annualVolume ? Number(p.annualVolume) : null,
          },
        });
        for (const f of FIELDS) {
          const value = p[f];
          if (!value) continue;
          const fromAi = input.suggested?.[f] !== undefined && input.suggested[f] === value;
          await tx.partField.create({ data: { partId: part.id, field: f, source: fromAi ? "email" : "manual", aiFilled: fromAi, accepted: !fromAi } });
        }
        await tx.auditLog.create({ data: { userId: ownerId, action: "rfq.create", entity: "Rfq", entityId: rfq.id, meta: { rfqNo, viaIntake: Boolean(input.sourceEmail) } } });
        return { rfqId: rfq.id, partId: part.id, rfqNo };
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002" && attempt < 3) continue; // two people took the same number at once
      throw error;
    }
  }
  throw new Error("Could not allocate an RFQ number");
}
