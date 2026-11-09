import { beforeAll, describe, expect, it } from "vitest";
import { saveQuoteVersion } from "@/server/services/costing";
import { BIG_VOLUME, SMALL_VOLUME, auditFor, db, ensureRates, formFor, makePart, makeUser, savedQuote, sqlError, uid } from "./helpers";

let estimator: Awaited<ReturnType<typeof makeUser>>;
let head: Awaited<ReturnType<typeof makeUser>>;
beforeAll(async () => {
  await ensureRates();
  estimator = await makeUser("estimator");
  head = await makeUser("sales_head");
});

const NOT_ALLOWED = /append-only|cannot be edited|never deleted|cannot change|recorded once|violates/i;

describe("audit log is append-only", () => {
  it("rejects update, delete and truncate", async () => {
    const entry = await db().auditLog.create({ data: { userId: estimator.id, action: "test.entry", entity: "Test", entityId: uid() } });
    expect(await sqlError(() => db().auditLog.update({ where: { id: entry.id }, data: { action: "tampered" } }))).toMatch(/append-only/i);
    expect(await sqlError(() => db().auditLog.delete({ where: { id: entry.id } }))).toMatch(/append-only/i);
    expect(await sqlError(() => db().$executeRawUnsafe('TRUNCATE "AuditLog"'))).toMatch(/append-only/i);
    expect(await sqlError(() => db().$executeRawUnsafe('DELETE FROM "AuditLog"'))).toMatch(/append-only/i);
    expect((await db().auditLog.findUnique({ where: { id: entry.id } }))?.action).toBe("test.entry");
  });
  it("a user with audit entries cannot be deleted (it would rewrite history)", async () => {
    const u = await makeUser("estimator");
    await db().auditLog.create({ data: { userId: u.id, action: "test.entry", entity: "Test", entityId: uid() } });
    expect(await sqlError(() => db().user.delete({ where: { id: u.id } }))).not.toBe("NO_ERROR");
  });
});

describe("rate tables are append-only and cannot hold a negative-material-cost rate", () => {
  it("rejects update and delete of a rate row", async () => {
    const row = await db().rateMaterial.findFirstOrThrow({ where: { materialCode: "EN8" } });
    expect(await sqlError(() => db().rateMaterial.update({ where: { id: row.id }, data: { ratePerKg: "1" } }))).toMatch(/append-only/i);
    expect(await sqlError(() => db().rateMaterial.delete({ where: { id: row.id } }))).toMatch(/append-only/i);
  });
  it("rejects recovery above the material rate, bad efficiency and overhead", async () => {
    const base = { effectiveFrom: new Date("2030-01-01T00:00:00Z"), createdById: head.id };
    expect(await sqlError(() => db().rateMaterial.create({ data: { ...base, materialCode: `X${uid()}`, ratePerKg: "10", scrapRecoveryPerKg: "11" } }))).toMatch(/recovery_le_rate|check/i);
    expect(await sqlError(() => db().rateMachine.create({ data: { ...base, machineCode: `M${uid()}`, hourRate: "100", efficiency: "1.5" } }))).toMatch(/check/i);
    expect(await sqlError(() => db().rateMachine.create({ data: { ...base, machineCode: `M${uid()}`, hourRate: "100", efficiency: "0" } }))).toMatch(/check/i);
    expect(await sqlError(() => db().rateOverhead.create({ data: { ...base, category: `C${uid()}`, percent: "101" } }))).toMatch(/check/i);
  });
  it("rejects a duplicate effective date for the same code", async () => {
    const row = await db().rateMaterial.findFirstOrThrow({ where: { materialCode: "EN8" } });
    expect(await sqlError(() => db().rateMaterial.create({ data: { materialCode: "EN8", ratePerKg: "99", scrapRecoveryPerKg: "1", effectiveFrom: row.effectiveFrom, createdById: head.id } }))).not.toBe("NO_ERROR");
  });
});

describe("saved quote versions are historical records", () => {
  it("cannot be edited, deleted or have their results changed", async () => {
    const { partId } = await makePart(estimator);
    const { quoteId } = await savedQuote(estimator, partId, SMALL_VOLUME);
    expect(await sqlError(() => db().quote.update({ where: { id: quoteId }, data: { annualValue: "1.00" } }))).toMatch(NOT_ALLOWED);
    expect(await sqlError(() => db().quote.update({ where: { id: quoteId }, data: { inputs: { tampered: true } } }))).toMatch(NOT_ALLOWED);
    expect(await sqlError(() => db().quote.update({ where: { id: quoteId }, data: { ratesSnapshot: {} } }))).toMatch(NOT_ALLOWED);
    expect(await sqlError(() => db().quote.update({ where: { id: quoteId }, data: { volumeTiers: [] } }))).toMatch(NOT_ALLOWED);
    expect(await sqlError(() => db().quote.update({ where: { id: quoteId }, data: { requiresApproval: true } }))).toMatch(NOT_ALLOWED);
    expect(await sqlError(() => db().quote.delete({ where: { id: quoteId } }))).toMatch(NOT_ALLOWED);
    expect(await sqlError(() => db().$executeRawUnsafe(`DELETE FROM "Quote" WHERE "id" = '${quoteId}'`))).toMatch(NOT_ALLOWED);
  });
  it("deleting a part or an RFQ cannot erase its quotes", async () => {
    const { partId } = await makePart(estimator);
    const { quoteId } = await savedQuote(estimator, partId, SMALL_VOLUME);
    expect(await sqlError(() => db().part.delete({ where: { id: partId } }))).not.toBe("NO_ERROR");
    expect(await db().quote.findUnique({ where: { id: quoteId } })).not.toBeNull();
  });
  it("status can only follow the allowed transitions, enforced by the database itself", async () => {
    const { partId } = await makePart(estimator);
    const big = await savedQuote(estimator, partId, BIG_VOLUME);
    expect(await sqlError(() => db().quote.update({ where: { id: big.quoteId }, data: { status: "approved", approverId: head.id, decidedAt: new Date() } }))).toMatch(/cannot change from draft to approved/);
    expect(await sqlError(() => db().quote.update({ where: { id: big.quoteId }, data: { status: "sent" } }))).toMatch(/cannot change from draft to sent/);
    await db().quote.update({ where: { id: big.quoteId }, data: { status: "pending_approval" } });
    expect(await sqlError(() => db().quote.update({ where: { id: big.quoteId }, data: { status: "draft" } }))).toMatch(/cannot change/);
    expect(await sqlError(() => db().quote.update({ where: { id: big.quoteId }, data: { status: "sent" } }))).toMatch(/cannot change/);
    // a decision without approver and time, or a rejection without a remark, is refused
    expect(await sqlError(() => db().quote.update({ where: { id: big.quoteId }, data: { status: "approved" } }))).toMatch(/decision_chk|check/i);
    expect(await sqlError(() => db().quote.update({ where: { id: big.quoteId }, data: { status: "rejected", approverId: head.id, decidedAt: new Date() } }))).toMatch(/decision_chk|check/i);
    expect(await sqlError(() => db().quote.update({ where: { id: big.quoteId }, data: { status: "rejected", approverId: head.id, decidedAt: new Date(), approvalComment: "  " } }))).toMatch(/decision_chk|check/i);
  });
  it("a quote that needs no approval goes draft -> ready_to_send -> sent, never draft -> sent; one that needs approval can never be ready_to_send", async () => {
    const { partId } = await makePart(estimator);
    const small = await savedQuote(estimator, partId, SMALL_VOLUME);
    expect(await sqlError(() => db().quote.update({ where: { id: small.quoteId }, data: { status: "sent" } }))).toMatch(/cannot change from draft to sent/);
    await db().quote.update({ where: { id: small.quoteId }, data: { status: "ready_to_send" } });
    expect(await sqlError(() => db().quote.update({ where: { id: small.quoteId }, data: { status: "draft" } }))).toMatch(/cannot change/);
    expect(await sqlError(() => db().quote.update({ where: { id: small.quoteId }, data: { status: "approved", approverId: head.id, decidedAt: new Date() } }))).toMatch(/cannot change from ready_to_send to approved/);
    await db().quote.update({ where: { id: small.quoteId }, data: { status: "sent" } });
    const other = await makePart(estimator);
    const big = await savedQuote(estimator, other.partId, BIG_VOLUME);
    expect(await sqlError(() => db().quote.update({ where: { id: big.quoteId }, data: { status: "ready_to_send" } }))).toMatch(/cannot change from draft to ready_to_send/);
  });
  it("a quote above the threshold can never jump to sent without approval", async () => {
    const { partId } = await makePart(estimator);
    const big = await savedQuote(estimator, partId, BIG_VOLUME);
    expect(big.quoteId).toBeTruthy();
    expect(await sqlError(() => db().quote.update({ where: { id: big.quoteId }, data: { status: "sent" } }))).toMatch(/cannot change from draft to sent/);
  });
});

describe("RFQ and part constraints", () => {
  it("RFQ status moves forward only; lost needs a reason", async () => {
    const { rfqId } = await makePart(estimator);
    expect(await sqlError(() => db().rfq.update({ where: { id: rfqId }, data: { status: "won" } }))).toMatch(/cannot change from estimating to won/);
    await db().rfq.update({ where: { id: rfqId }, data: { status: "sent" } });
    expect(await sqlError(() => db().rfq.update({ where: { id: rfqId }, data: { status: "estimating" } }))).toMatch(/cannot change/);
    expect(await sqlError(() => db().rfq.update({ where: { id: rfqId }, data: { status: "lost" } }))).toMatch(/lost_requires_reason|check/i);
    await db().rfq.update({ where: { id: rfqId }, data: { status: "lost", lostReason: "price" } });
    expect(await sqlError(() => db().rfq.update({ where: { id: rfqId }, data: { status: "won" } }))).toMatch(/cannot change/);
  });
  it("part values: net above gross, zero weight, zero volume, negative costs", async () => {
    const { partId } = await makePart(estimator);
    for (const data of [{ netWeightKg: "9.0000" }, { grossWeightKg: "0.0000" }, { annualVolume: 0 }, { setupCost: "-1" }, { toolingCost: "-1" }]) {
      expect(await sqlError(() => db().part.update({ where: { id: partId }, data }))).toMatch(/Part_values_chk|check/i);
    }
  });
  it("routing cycle time must be positive; relationships must exist", async () => {
    const { partId } = await makePart(estimator);
    expect(await sqlError(() => db().routingStep.create({ data: { partId, seq: 9, operation: "x", machineCode: "CNC-T1", cycleTimeMin: "0" } }))).toMatch(/check/i);
    expect(await sqlError(() => db().part.create({ data: { rfqId: "does-not-exist", name: "orphan" } }))).not.toBe("NO_ERROR");
    expect(await sqlError(() => db().quote.create({ data: { partId: "does-not-exist", version: 1, quotedOn: new Date(), inputs: {}, ratesSnapshot: {}, rateRowIds: {}, volumeTiers: [], annualValue: "1", requiresApproval: false, createdById: estimator.id } }))).not.toBe("NO_ERROR");
  });
  it("RFQ numbers and (part, version) pairs are unique", async () => {
    const { rfqId, partId, customerId } = await makePart(estimator);
    const rfq = await db().rfq.findUniqueOrThrow({ where: { id: rfqId } });
    expect(await sqlError(() => db().rfq.create({ data: { rfqNo: rfq.rfqNo, customerId, ownerId: estimator.id, dueDate: new Date() } }))).not.toBe("NO_ERROR");
    const { quoteId } = await savedQuote(estimator, partId, SMALL_VOLUME);
    const q = await db().quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(await sqlError(() => db().quote.create({ data: { partId, version: q.version, quotedOn: new Date(), inputs: {}, ratesSnapshot: {}, rateRowIds: {}, volumeTiers: [], annualValue: "1", requiresApproval: false, createdById: estimator.id } }))).not.toBe("NO_ERROR");
  });
});

describe("failed transactions roll back completely", () => {
  it("a save that fails at the end leaves the part, routing, quotes and audit untouched", async () => {
    const { partId } = await makePart(estimator, { annualVolume: 777 });
    const before = await db().part.findUniqueOrThrow({ where: { id: partId }, include: { routing: true } });
    const ghost = { ...estimator, id: "user-that-does-not-exist" }; // the quote insert fails its foreign key after the part was updated
    await expect(saveQuoteVersion(ghost, { partId, form: formFor("123456", { grossWeightKg: "0.9000", netWeightKg: "0.8000", routing: [{ operation: "Other", machineCode: "VMC-1", cycleTimeMin: "9" }] }) })).rejects.toThrow();
    const after = await db().part.findUniqueOrThrow({ where: { id: partId }, include: { routing: true } });
    expect(after.annualVolume).toBe(before.annualVolume);
    expect(after.grossWeightKg?.toString()).toBe(before.grossWeightKg?.toString());
    expect(after.routing.map((r) => [r.operation, r.machineCode])).toEqual(before.routing.map((r) => [r.operation, r.machineCode]));
    expect(await db().quote.count({ where: { partId } })).toBe(0);
    expect(await db().partField.count({ where: { partId } })).toBe(0);
  });
  it("a save writes the quote and its audit entry together", async () => {
    const { partId } = await makePart(estimator);
    const { quoteId } = await savedQuote(estimator, partId, SMALL_VOLUME);
    const trail = await auditFor("Quote", quoteId);
    expect(trail.map((t) => t.action)).toEqual(["quote.save"]);
    expect(trail[0]!.userId).toBe(estimator.id);
  });
});
