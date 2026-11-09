/**
 * Seeds demo data. Safe to run repeatedly: existing users, customers, rates, RFQs and
 * past quotes are left alone, so nothing is duplicated and nothing is overwritten.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth/password";
import { todayIst } from "../src/lib/format/dates";
import {
  DEMO_CUSTOMERS, DEMO_RFQS, DEMO_USERS, MACHINE_RATES, MATERIAL_RATES, OVERHEAD_RATES, PAST_QUOTES,
  isAiFilled, pastQuoteKey, rfqDueDate,
} from "./seed-data";

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const today = todayIst();

  try {
    // Users: never overwrite an existing account (its password may have been changed).
    const userIds = new Map<string, string>();
    for (const u of DEMO_USERS) {
      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: { email: u.email, name: u.name, role: u.role, passwordHash: await hashPassword(u.password) },
      });
      userIds.set(u.role, user.id);
    }
    const estimatorId = userIds.get("estimator")!;
    const salesHeadId = userIds.get("sales_head")!;

    for (const name of DEMO_CUSTOMERS) await prisma.customer.upsert({ where: { name }, update: {}, create: { name } });

    // Rates are append-only (database triggers), so insert and skip rows that already exist.
    const createdById = salesHeadId;
    const rates = await Promise.all([
      prisma.rateMaterial.createMany({ data: MATERIAL_RATES.map((r) => ({ ...r, effectiveFrom: asDate(r.effectiveFrom), createdById })), skipDuplicates: true }),
      prisma.rateMachine.createMany({ data: MACHINE_RATES.map((r) => ({ ...r, effectiveFrom: asDate(r.effectiveFrom), createdById })), skipDuplicates: true }),
      prisma.rateOverhead.createMany({ data: OVERHEAD_RATES.map((r) => ({ ...r, effectiveFrom: asDate(r.effectiveFrom), createdById })), skipDuplicates: true }),
    ]);

    let rfqsCreated = 0;
    for (const rfq of DEMO_RFQS) {
      if (await prisma.rfq.findUnique({ where: { rfqNo: rfq.rfqNo } })) continue;
      const customer = await prisma.customer.findUniqueOrThrow({ where: { name: rfq.customer } });
      const p = rfq.part;
      await prisma.rfq.create({
        data: {
          rfqNo: rfq.rfqNo,
          customerId: customer.id,
          ownerId: estimatorId,
          status: rfq.status,
          lostReason: rfq.lostReason,
          dueDate: asDate(rfqDueDate(rfq, today)),
          sourceEmail: rfq.sourceEmail,
          parts: {
            create: {
              name: p.name,
              materialCode: p.materialCode,
              grossWeightKg: p.grossWeightKg,
              netWeightKg: p.netWeightKg,
              annualVolume: p.annualVolume,
              setupCost: p.setupCost,
              toolingCost: p.toolingCost,
              routing: { create: p.routing.map((step, i) => ({ seq: i + 1, ...step })) },
              fields: {
                create: Object.entries(p.fields).map(([field, f]) => ({ field, source: f.source, aiFilled: isAiFilled(f.source), accepted: f.accepted })),
              },
            },
          },
        },
      });
      rfqsCreated += 1;
    }

    const pastQuotes = await prisma.pastQuote.createMany({
      data: PAST_QUOTES.map((q) => ({
        importKey: pastQuoteKey(q),
        customer: q.customer,
        partName: q.partName,
        materialCode: q.materialCode,
        grossWeightKg: q.grossWeightKg,
        routing: q.routing,
        pricePerUnit: q.pricePerUnit,
        quoteRef: q.quoteRef,
        quotedOn: asDate(q.quotedOn),
      })),
      skipDuplicates: true,
    });

    console.log(
      `Seed complete: ${DEMO_USERS.length} users, ${rfqsCreated} new RFQs (of ${DEMO_RFQS.length}), ` +
        `${rates[0].count + rates[1].count + rates[2].count} new rate rows, ${pastQuotes.count} new past quotes.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
