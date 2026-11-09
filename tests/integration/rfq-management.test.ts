import { beforeAll, describe, expect, it } from "vitest";
import { addPart, createRfq, readPartList, removePart, renamePart, updateRfq } from "@/server/services/rfqs";
import { listRfqs } from "@/server/repositories/rfqs";
import { parseRfqFilters } from "@/lib/rfq/filters";
import { createRfqManual, getRfqDetail } from "@/server/repositories/rfq-manage";
import { submitQuote } from "@/server/services/costing";
import { sendQuote } from "@/server/services/quotes";
import { SMALL_VOLUME, auditFor, db, ensureRates, makeUser, savedQuote, uid } from "./helpers";

let est: Awaited<ReturnType<typeof makeUser>>;
let head: Awaited<ReturnType<typeof makeUser>>;
beforeAll(async () => {
  await ensureRates();
  est = await makeUser("estimator");
  head = await makeUser("sales_head");
});

const part = (name: string, extra: Record<string, string> = {}) => ({ name, materialCode: "EN8", grossWeightKg: "0.61", netWeightKg: "0.52", annualVolume: "1000", ...extra });
const NOW = "2026-11-06";
async function newRfq(parts = [part("Shaft"), part("Bracket", { materialCode: "" })]) {
  const res = await createRfq(est, { customer: `Cust ${uid()}`, dueDate: "2026-12-10", parts }, NOW);
  if (!res.ok) throw new Error(res.error);
  return res;
}

describe("register sorting", () => {
  it("orders by customer, due date, received date and RFQ number, both ways, and shows the received date", async () => {
    const tag = uid();
    const make = async (name: string, due: string) => {
      const r = await createRfq(est, { customer: `${tag}-${name}`, dueDate: due, parts: [part("P")] }, NOW);
      if (!r.ok) throw new Error(r.error);
      return r.rfqNo;
    };
    const zeta = await make("Zeta", "2026-12-20");
    const alpha = await make("Alpha", "2026-12-01");
    const mid = await make("Mid", "2026-12-10");
    const order = async (params: Record<string, string>) => (await listRfqs(parseRfqFilters({ q: tag, ...params }), est.id)).rows.map((r) => r.rfqNo);

    expect(await order({})).toEqual([alpha, mid, zeta]);                       // due soonest first (default)
    expect(await order({ dir: "desc" })).toEqual([zeta, mid, alpha]);
    expect(await order({ sort: "customer" })).toEqual([alpha, mid, zeta]);
    expect(await order({ sort: "customer", dir: "desc" })).toEqual([zeta, mid, alpha]);
    expect(await order({ sort: "received" })).toEqual([mid, alpha, zeta]);    // newest registered first
    expect(await order({ sort: "received", dir: "asc" })).toEqual([zeta, alpha, mid]);
    expect(await order({ sort: "rfq" })).toEqual([zeta, alpha, mid]);          // numbers were allocated in creation order
    expect(await order({ sort: "rfq", dir: "desc" })).toEqual([mid, alpha, zeta]);

    const { rows } = await listRfqs(parseRfqFilters({ q: tag }), est.id);
    expect(rows[0]!.receivedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("part list from a customer's file", () => {
  const csv = (rows: string[]) => new File([["part_name,part_number,material,gross_weight_kg,net_weight_kg,annual_volume,drawing_ref", ...rows].join("\n")], "parts.csv", { type: "text/csv" });

  it("reads a CSV against the real rate masters, writes nothing, and refuses a role without rfq:create", async () => {
    const before = await db().rfq.count();
    const res = await readPartList(est, csv(["Spindle,S-1,EN8,0.61,0.52,180000,D-1", "Odd,O-1,Unobtainium,1,,,"]));
    if (!res.ok) throw new Error(res.error);
    expect(res.report.parts.map((p) => p.part.name)).toEqual(["Spindle", "Odd"]);
    expect(res.report.parts[1]!.part.materialCode).toBe("");
    expect(res.report.warnings).toHaveLength(1);
    expect(await db().rfq.count()).toBe(before);
    expect((await readPartList(head, csv(["X,,,,,,"]))).ok).toBe(false);
    expect((await readPartList(null, csv(["X,,,,,,"]))).ok).toBe(false);
  });

  it("creates parts from a file as unreviewed Excel values that block submit until accepted, with the source in the audit trail", async () => {
    const res = await createRfq(est, { customer: `Cust ${uid()}`, dueDate: "2026-12-10", source: "excel", parts: [part("Spindle", { partNumber: "S-1", drawingRef: "D-1" })] }, NOW);
    if (!res.ok) throw new Error(res.error);
    const fields = await db().partField.findMany({ where: { partId: res.partIds[0] } });
    expect(fields).toHaveLength(4);
    expect(fields.every((f) => f.source === "excel" && f.aiFilled && !f.accepted)).toBe(true);
    const saved = await db().part.findUniqueOrThrow({ where: { id: res.partIds[0] } });
    expect(saved).toMatchObject({ partNumber: "S-1", drawingRef: "D-1" });
    const trail = await auditFor("Rfq", res.rfqId);
    expect(trail[0]!.meta).toMatchObject({ source: "excel", viaIntake: true });
  });

  it("rejects an unknown source value", async () => {
    const res = await createRfq(est, { customer: "C", dueDate: "2026-12-10", source: "email-ai", parts: [part("P")] }, NOW);
    expect(res.ok).toBe(false);
  });
});

describe("create", () => {
  it("saves the RFQ, customer and every part with manual, accepted field records, and audits it", async () => {
    const res = await newRfq();
    expect(res.rfqNo).toMatch(/^RFQ-2611-\d{3}$/);
    const detail = await getRfqDetail(res.rfqId);
    expect(detail?.parts.map((p) => p.name)).toEqual(["Shaft", "Bracket"]);
    expect(detail?.status).toBe("estimating");
    const fields = await db().partField.findMany({ where: { partId: res.partIds[0] } });
    expect(fields).toHaveLength(4);
    expect(fields.every((f) => f.source === "manual" && f.accepted && !f.aiFilled)).toBe(true);
    expect((await db().partField.count({ where: { partId: res.partIds[1] } }))).toBe(3); // blank material has no record
    const trail = await auditFor("Rfq", res.rfqId);
    expect(trail.map((a) => a.action)).toEqual(["rfq.create"]);
    expect(trail[0]!.userId).toBe(est.id);
  });

  it("gives concurrent creations different numbers", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => createRfq(est, { customer: `Cust ${uid()}`, dueDate: "2026-12-10", parts: [part("P")] }, "2030-03-01")));
    const nos = results.map((r) => (r.ok ? r.rfqNo : "FAILED"));
    expect(new Set(nos).size).toBe(5);
    expect(nos).not.toContain("FAILED");
  });

  it("a database failure part-way leaves nothing behind (rollback)", async () => {
    const customer = `Rollback ${uid()}`;
    // The second part breaks a database CHECK (net above gross); the repository is called directly to bypass zod.
    await expect(
      createRfqManual({ customer, dueDate: "2026-12-10", parts: [part("Ok"), part("Bad", { grossWeightKg: "1", netWeightKg: "2" })] }, est.id, NOW),
    ).rejects.toThrow();
    expect(await db().customer.count({ where: { name: customer } })).toBe(0);
    expect(await db().part.count({ where: { name: "Ok", rfq: { customer: { name: customer } } } })).toBe(0);
  });

  it("rejects a weight the database column could not hold, with a clear message", async () => {
    const res = await createRfq(est, { customer: "X", dueDate: "2026-12-10", parts: [part("Huge", { grossWeightKg: "9999999", netWeightKg: "" })] }, NOW);
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("up to 999999.9999") });
  });

  it("refuses invalid input without touching the database", async () => {
    const before = await db().rfq.count();
    const res = await createRfq(est, { customer: "X", dueDate: "2026-12-10", parts: [part("Bad", { netWeightKg: "2" })] }, NOW);
    expect(res).toMatchObject({ ok: false, error: "Net weight cannot exceed gross weight" });
    expect(await db().rfq.count()).toBe(before);
  });

  it("is estimator-only", async () => {
    const res = await createRfq(head, { customer: "X", dueDate: "2026-12-10", parts: [part("P")] }, NOW);
    expect(res.ok).toBe(false);
    expect(await createRfq(null, {}, NOW)).toMatchObject({ ok: false });
  });
});

describe("edit, add and remove while estimating", () => {
  it("updates customer and due date, with before and after in the audit entry", async () => {
    const r = await newRfq();
    const other = `Other ${uid()}`;
    expect(await updateRfq(est, { rfqId: r.rfqId, customer: other, dueDate: "2027-01-15" })).toEqual({ ok: true });
    const d = await getRfqDetail(r.rfqId);
    expect(d).toMatchObject({ customer: other, dueDate: "2027-01-15" });
    const trail = await auditFor("Rfq", r.rfqId);
    expect(trail.at(-1)).toMatchObject({ action: "rfq.update" });
    expect((trail.at(-1)!.meta as { to: { customer: string } }).to.customer).toBe(other);
  });

  it("adds, renames and removes an unquoted part, each audited", async () => {
    const r = await newRfq();
    const added = await addPart(est, { rfqId: r.rfqId, part: part("Pin") });
    if (!added.ok) throw new Error(added.error);
    expect((await getRfqDetail(r.rfqId))?.parts).toHaveLength(3);
    expect(await renamePart(est, { partId: added.partId, name: "Pin B" })).toEqual({ ok: true });
    expect(await removePart(est, { partId: added.partId })).toEqual({ ok: true });
    expect((await getRfqDetail(r.rfqId))?.parts).toHaveLength(2);
    expect((await auditFor("Part", added.partId)).map((a) => a.action)).toEqual(["part.add", "part.rename", "part.remove"]);
  });

  it("will not remove the last part or a part that has saved quote versions", async () => {
    const one = await newRfq([part("Only")]);
    expect(await removePart(est, { partId: one.partIds[0] })).toMatchObject({ ok: false, error: expect.stringContaining("at least one part") });
    const two = await newRfq();
    await savedQuote(est, two.partIds[0]!, SMALL_VOLUME);
    expect(await removePart(est, { partId: two.partIds[0] })).toMatchObject({ ok: false, error: expect.stringContaining("saved quote versions") });
    expect((await getRfqDetail(two.rfqId))?.parts).toHaveLength(2);
  });

  it("caps the number of parts", async () => {
    const r = await newRfq(Array.from({ length: 20 }, (_, i) => part(`P${i}`)));
    expect(await addPart(est, { rfqId: r.rfqId, part: part("21st") })).toMatchObject({ ok: false, error: expect.stringContaining("at most 20") });
  });

  it("is refused once the RFQ is sent, and for a sales head", async () => {
    const r = await newRfq([part("Small")]);
    const q = await savedQuote(est, r.partIds[0]!, SMALL_VOLUME);
    expect(await submitQuote(est, { quoteId: q.quoteId })).toMatchObject({ ok: true, status: "ready_to_send" });
    expect(await sendQuote(head, { quoteId: q.quoteId })).toMatchObject({ ok: true });
    const msg = expect.stringContaining("can no longer be edited");
    expect(await updateRfq(est, { rfqId: r.rfqId, customer: "Z", dueDate: "2027-01-01" })).toMatchObject({ ok: false, error: msg });
    expect(await addPart(est, { rfqId: r.rfqId, part: part("Late") })).toMatchObject({ ok: false, error: msg });
    expect(await renamePart(est, { partId: r.partIds[0], name: "Renamed" })).toMatchObject({ ok: false, error: msg });
    const fresh = await newRfq();
    for (const result of [
      await updateRfq(head, { rfqId: fresh.rfqId, customer: "Z", dueDate: "2027-01-01" }),
      await addPart(head, { rfqId: fresh.rfqId, part: part("x") }),
      await removePart(head, { partId: fresh.partIds[0] }),
    ]) expect(result).toMatchObject({ ok: false });
  });

  it("an edit racing a submit is serialised: either the edit lands first or it is refused, never both half-applied", async () => {
    const r = await newRfq([part("Race")]);
    const q = await savedQuote(est, r.partIds[0]!, SMALL_VOLUME);
    const [edit, submit] = await Promise.all([addPart(est, { rfqId: r.rfqId, part: part("Racer") }), submitQuote(est, { quoteId: q.quoteId })]);
    const parts = (await getRfqDetail(r.rfqId))!.parts.length;
    expect(submit).toMatchObject({ ok: true });
    expect(edit.ok ? parts === 2 : parts === 1).toBe(true);
  });
});

describe("part value edits are audited", () => {
  it("records who changed a value and who accepted an AI value, with before and after", async () => {
    const { updatePartField, acceptPartField } = await import("@/server/services/costing");
    const { makePart } = await import("./helpers");
    const { partId } = await makePart(est, { aiUnaccepted: ["materialCode"] });
    expect(await updatePartField(est, { partId, field: "grossWeightKg", value: "0.7" })).toEqual({ ok: true });
    expect(await acceptPartField(est, { partId, field: "materialCode" })).toEqual({ ok: true });
    expect(await acceptPartField(est, { partId, field: "materialCode" })).toMatchObject({ ok: false }); // nothing left to accept, and no second audit row
    const trail = await auditFor("Part", partId);
    expect(trail.map((a) => a.action)).toEqual(["part.update", "part.accept"]);
    expect(trail[0]!.meta).toMatchObject({ field: "grossWeightKg", from: "0.61", to: "0.7" });
    expect(trail.every((a) => a.userId === est.id)).toBe(true);
  });
  it("an edit that breaks net <= gross is refused and leaves the value and the audit trail alone", async () => {
    const { updatePartField } = await import("@/server/services/costing");
    const { makePart } = await import("./helpers");
    const { partId } = await makePart(est);
    expect(await updatePartField(est, { partId, field: "netWeightKg", value: "9" })).toMatchObject({ ok: false });
    expect(await auditFor("Part", partId)).toHaveLength(0);
  });
});
