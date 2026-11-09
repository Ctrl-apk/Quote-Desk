import { beforeAll, describe, expect, it } from "vitest";
import { saveQuoteVersion, submitQuote } from "@/server/services/costing";
import { decideQuote, markOutcome, sendQuote } from "@/server/services/quotes";
import { BIG_VOLUME, SMALL_VOLUME, auditFor, db, ensureRates, formFor, makePart, makeUser, savedQuote } from "./helpers";

let est: Awaited<ReturnType<typeof makeUser>>;
let est2: Awaited<ReturnType<typeof makeUser>>;
let head: Awaited<ReturnType<typeof makeUser>>;
beforeAll(async () => {
  await ensureRates();
  est = await makeUser("estimator");
  est2 = await makeUser("estimator");
  head = await makeUser("sales_head");
});

const status = async (quoteId: string) => (await db().quote.findUniqueOrThrow({ where: { id: quoteId } })).status;
const rfqStatus = async (rfqId: string) => (await db().rfq.findUniqueOrThrow({ where: { id: rfqId } })).status;
const actions = async (quoteId: string) => (await auditFor("Quote", quoteId)).map((a) => a.action);

describe("submission", () => {
  it("a quote above the threshold goes to approval; at or below it becomes ready for the sales head to send, and the RFQ moves only when it is sent", async () => {
    const big = await makePart(est);
    const bq = await savedQuote(est, big.partId, BIG_VOLUME);
    expect(await submitQuote(est, { quoteId: bq.quoteId })).toEqual({ ok: true, status: "pending_approval" });
    expect(await status(bq.quoteId)).toBe("pending_approval");
    expect(await rfqStatus(big.rfqId)).toBe("estimating");

    const small = await makePart(est);
    const sq = await savedQuote(est, small.partId, SMALL_VOLUME);
    expect(await submitQuote(est, { quoteId: sq.quoteId })).toEqual({ ok: true, status: "ready_to_send" });
    expect(await status(sq.quoteId)).toBe("ready_to_send");
    expect(await rfqStatus(small.rfqId)).toBe("estimating"); // submitting does not send
  });

  it("the ₹25,00,000 threshold, through the real save and submit path: one piece under and exactly at it are ready to send without approval, one piece over needs approval", async () => {
    // Price is exactly ₹100.00 a piece: material 1 kg x ₹76 + conversion 1.2 min at ₹850/hr (₹17.00) + packing ₹7.00, with no scrap, overhead, markup, setup or freight.
    // So the annual value is exactly 100 x volume, pre-GST.
    const exact = { grossWeightKg: "1", netWeightKg: "1", scrapPercent: "0", overheadPercent: "0", setupCost: "0", toolingCost: "0", packingPerUnit: "7.00", markupPercent: "0", freightPerUnit: ["0", "0", "0"] as [string, string, string], quotedOn: "2026-11-03", routing: [{ operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "1.2" }] };
    const cases = [
      { volume: "24999", annual: "2499900.00", needs: false, final: "ready_to_send" },
      { volume: "25000", annual: "2500000.00", needs: false, final: "ready_to_send" },
      { volume: "25001", annual: "2500100.00", needs: true, final: "pending_approval" },
    ] as const;
    for (const c of cases) {
      const { partId } = await makePart(est);
      const { quoteId } = await savedQuote(est, partId, c.volume, exact);
      const saved = await db().quote.findUniqueOrThrow({ where: { id: quoteId } });
      expect(saved.annualValue.toFixed(2)).toBe(c.annual);
      expect(saved.requiresApproval).toBe(c.needs);
      expect(await submitQuote(est, { quoteId })).toEqual({ ok: true, status: c.final });
    }
  });

  it("GST is not part of the approval figure: a quote just under the threshold stays under it even though price plus 18% GST is over it", async () => {
    const { partId } = await makePart(est);
    const exact = { grossWeightKg: "1", netWeightKg: "1", scrapPercent: "0", overheadPercent: "0", setupCost: "0", toolingCost: "0", packingPerUnit: "7.00", markupPercent: "0", gstPercent: "18", freightPerUnit: ["0", "0", "0"] as [string, string, string], quotedOn: "2026-11-03", routing: [{ operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "1.2" }] };
    const { quoteId } = await savedQuote(est, partId, "24999", exact); // 2,499,900 pre-GST; 2,949,882 with GST
    expect((await db().quote.findUniqueOrThrow({ where: { id: quoteId } })).requiresApproval).toBe(false);
  });

  it("a second submit of the same version is refused and writes nothing", async () => {
    const { partId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, BIG_VOLUME);
    expect((await submitQuote(est, { quoteId })).ok).toBe(true);
    const again = await submitQuote(est, { quoteId });
    expect(again.ok).toBe(false);
    expect(await actions(quoteId)).toEqual(["quote.save", "quote.submit"]);
  });

  it("only the latest version can be submitted", async () => {
    const { partId } = await makePart(est);
    const v1 = await savedQuote(est, partId, BIG_VOLUME);
    const v2 = await savedQuote(est, partId, BIG_VOLUME, { markupPercent: "12" });
    expect(v2.version).toBe(v1.version + 1);
    const old = await submitQuote(est, { quoteId: v1.quoteId });
    expect(old).toMatchObject({ ok: false, error: expect.stringMatching(/newer version/i) });
    expect(await status(v1.quoteId)).toBe("draft");
    expect((await submitQuote(est, { quoteId: v2.quoteId })).ok).toBe(true);
  });

  it("is blocked while an AI-filled value is unaccepted", async () => {
    const { partId } = await makePart(est, { aiUnaccepted: ["materialCode"] });
    // saving would mark changed fields as manual, so the unaccepted flag is checked on a version whose form matches the stored part
    const { quoteId } = await savedQuote(est, partId, "1000");
    await db().partField.upsert({ where: { partId_field: { partId, field: "annualVolume" } }, update: { aiFilled: true, accepted: false }, create: { partId, field: "annualVolume", source: "email", aiFilled: true, accepted: false } });
    const r = await submitQuote(est, { quoteId });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/accept or correct/i) });
    expect(await status(quoteId)).toBe("draft");
  });

  it("sales head and signed-out callers cannot submit", async () => {
    const { partId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, SMALL_VOLUME);
    expect((await submitQuote(head, { quoteId })).ok).toBe(false);
    expect((await submitQuote(null, { quoteId })).ok).toBe(false);
    expect(await status(quoteId)).toBe("draft");
  });

  it("is atomic: if the audit entry cannot be written the status change is undone", async () => {
    const { partId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, BIG_VOLUME);
    const ghost = { ...est, id: "no-such-user" };
    await expect(submitQuote(ghost, { quoteId })).rejects.toThrow();
    expect(await status(quoteId)).toBe("draft");
    expect(await actions(quoteId)).toEqual(["quote.save"]);
  });
});

describe("concurrent requests", () => {
  it("ten simultaneous submits of one version: exactly one wins, one audit entry", async () => {
    const { partId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, BIG_VOLUME);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => submitQuote(i % 2 ? est : est2, { quoteId })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await status(quoteId)).toBe("pending_approval");
    expect((await actions(quoteId)).filter((a) => a === "quote.submit")).toHaveLength(1);
  });

  it("simultaneous approve and reject: exactly one decision is recorded", async () => {
    const { partId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, BIG_VOLUME);
    await submitQuote(est, { quoteId });
    const head2 = await makeUser("sales_head");
    const results = await Promise.all([
      decideQuote(head, { quoteId, action: "approve" }),
      decideQuote(head2, { quoteId, action: "reject", comment: "Freight too low" }),
      decideQuote(head, { quoteId, action: "approve" }),
      decideQuote(head2, { quoteId, action: "reject", comment: "Duplicate" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const decisions = (await actions(quoteId)).filter((a) => a === "quote.approve" || a === "quote.reject");
    expect(decisions).toHaveLength(1);
    const q = await db().quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(["approved", "rejected"]).toContain(q.status);
    expect(q.approverId).not.toBeNull();
    expect(q.decidedAt).not.toBeNull();
  });

  it("a submit racing a new save never submits a superseded version", async () => {
    for (let i = 0; i < 5; i++) {
      const { partId } = await makePart(est);
      const v1 = await savedQuote(est, partId, BIG_VOLUME);
      const [sub, save] = await Promise.all([submitQuote(est, { quoteId: v1.quoteId }), saveQuoteVersion(est2, { partId, form: formFor(BIG_VOLUME, { markupPercent: "13" }) })]);
      expect(save.ok).toBe(true);
      const latest = await db().quote.findFirstOrThrow({ where: { partId }, orderBy: { version: "desc" } });
      expect(latest.version).toBe(2);
      // either the submit ran first (v1 submitted, then v2 saved as a new draft) or the save ran first (submit refused as superseded)
      if (sub.ok) expect(await status(v1.quoteId)).toBe("pending_approval");
      else expect(await status(v1.quoteId)).toBe("draft");
      expect(latest.status).toBe("draft");
    }
  });

  it("fifteen simultaneous saves get distinct, consecutive versions with no failures", async () => {
    const { partId } = await makePart(est);
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) => saveQuoteVersion(est, { partId, form: formFor(SMALL_VOLUME, { markupPercent: String(5 + i) }) })));
    expect(results.every((r) => r.ok)).toBe(true);
    const versions = (await db().quote.findMany({ where: { partId }, orderBy: { version: "asc" } })).map((q) => q.version);
    expect(versions).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
});

describe("approval", () => {
  it("only the sales head can decide; an estimator cannot approve, even their own quote", async () => {
    const { partId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, BIG_VOLUME);
    await submitQuote(est, { quoteId });
    expect((await decideQuote(est, { quoteId, action: "approve" })).ok).toBe(false);
    expect((await decideQuote(null, { quoteId, action: "approve" })).ok).toBe(false);
    expect(await status(quoteId)).toBe("pending_approval");
  });

  it("rejection needs a remark; approval records approver, remark and time", async () => {
    const { partId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, BIG_VOLUME);
    await submitQuote(est, { quoteId });
    for (const comment of [undefined, "", "  ", "ab"]) {
      expect((await decideQuote(head, { quoteId, action: "reject", comment })).ok).toBe(false);
    }
    expect(await status(quoteId)).toBe("pending_approval");
    expect((await decideQuote(head, { quoteId, action: "approve", comment: "Looks right" })).ok).toBe(true);
    const q = await db().quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(q).toMatchObject({ status: "approved", approverId: head.id, approvalComment: "Looks right" });
    expect(q.decidedAt).toBeInstanceOf(Date);
  });

  it("a rejected quote stays rejected with its remark and cannot be revived or sent", async () => {
    const { partId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, BIG_VOLUME);
    await submitQuote(est, { quoteId });
    expect((await decideQuote(head, { quoteId, action: "reject", comment: "Margin too thin" })).ok).toBe(true);
    expect((await decideQuote(head, { quoteId, action: "approve" })).ok).toBe(false);
    expect((await sendQuote(est, { quoteId })).ok).toBe(false);
    const q = await db().quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(q).toMatchObject({ status: "rejected", approvalComment: "Margin too thin" });
  });

  it("a superseded version can be rejected but not approved", async () => {
    const { partId } = await makePart(est);
    const v1 = await savedQuote(est, partId, BIG_VOLUME);
    await submitQuote(est, { quoteId: v1.quoteId });
    await savedQuote(est, partId, BIG_VOLUME, { markupPercent: "14" });
    expect(await decideQuote(head, { quoteId: v1.quoteId, action: "approve" })).toMatchObject({ ok: false, error: expect.stringMatching(/newer version/i) });
    expect((await decideQuote(head, { quoteId: v1.quoteId, action: "reject", comment: "Replaced by v2" })).ok).toBe(true);
  });

  it("a draft cannot be decided", async () => {
    const { partId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, BIG_VOLUME);
    expect((await decideQuote(head, { quoteId, action: "approve" })).ok).toBe(false);
  });
});

describe("sending and outcome", () => {
  it("a quote that needs approval cannot be sent until approved; only the sales head sends; sending twice is refused", async () => {
    const { partId, rfqId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, BIG_VOLUME);
    expect((await sendQuote(head, { quoteId })).ok).toBe(false); // draft
    await submitQuote(est, { quoteId });
    expect((await sendQuote(head, { quoteId })).ok).toBe(false); // pending
    await decideQuote(head, { quoteId, action: "approve" });
    expect(await sendQuote(est, { quoteId })).toMatchObject({ ok: false, error: "You do not have permission to do this" });
    expect(await status(quoteId)).toBe("approved");
    const both = await Promise.all([sendQuote(head, { quoteId }), sendQuote(head, { quoteId })]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(await status(quoteId)).toBe("sent");
    expect(await rfqStatus(rfqId)).toBe("sent");
    expect((await actions(quoteId)).filter((a) => a === "quote.send")).toHaveLength(1);
    expect((await sendQuote(head, { quoteId })).ok).toBe(false); // already sent
  });

  it("a quote that needs no approval: estimator submits, the estimator cannot send it, the sales head sends it without any approval step", async () => {
    const { partId, rfqId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, SMALL_VOLUME);
    expect((await sendQuote(head, { quoteId })).ok).toBe(false); // still a draft
    expect(await submitQuote(est, { quoteId })).toEqual({ ok: true, status: "ready_to_send" });
    expect(await sendQuote(est, { quoteId })).toMatchObject({ ok: false, error: "You do not have permission to do this" });
    expect((await decideQuote(head, { quoteId, action: "approve" })).ok).toBe(false); // nothing to approve
    expect(await status(quoteId)).toBe("ready_to_send");
    expect(await rfqStatus(rfqId)).toBe("estimating");
    expect((await db().quote.findUniqueOrThrow({ where: { id: quoteId } })).approverId).toBeNull();
    // two simultaneous sends from the sales head: exactly one wins
    const both = await Promise.all([sendQuote(head, { quoteId }), sendQuote(head, { quoteId })]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(await status(quoteId)).toBe("sent");
    expect(await rfqStatus(rfqId)).toBe("sent");
    expect(await actions(quoteId)).toEqual(["quote.save", "quote.submit", "quote.send"]);
    expect((await auditFor("Quote", quoteId)).at(-1)).toMatchObject({ userId: head.id });
  });

  it("an older ready-to-send version cannot be sent once a newer version exists", async () => {
    const { partId } = await makePart(est);
    const v1 = await savedQuote(est, partId, SMALL_VOLUME);
    await submitQuote(est, { quoteId: v1.quoteId });
    await savedQuote(est, partId, SMALL_VOLUME, { markupPercent: "12" });
    expect(await sendQuote(head, { quoteId: v1.quoteId })).toMatchObject({ ok: false, error: expect.stringContaining("newer version") });
    expect(await status(v1.quoteId)).toBe("ready_to_send");
  });

  it("won/lost: only after sent, lost needs a reason, estimator only, final", async () => {
    const { partId, rfqId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, SMALL_VOLUME);
    expect((await markOutcome(est, { quoteId, outcome: "won" })).ok).toBe(false); // not sent yet
    await submitQuote(est, { quoteId });
    expect((await markOutcome(est, { quoteId, outcome: "won" })).ok).toBe(false); // ready, but still not sent
    expect((await sendQuote(head, { quoteId })).ok).toBe(true);
    expect((await markOutcome(head, { quoteId, outcome: "won" })).ok).toBe(false);
    expect((await markOutcome(est, { quoteId, outcome: "lost", reason: "" })).ok).toBe(false);
    expect((await markOutcome(est, { quoteId, outcome: "lost", reason: "Customer chose a cheaper source" })).ok).toBe(true);
    expect((await markOutcome(est, { quoteId, outcome: "won" })).ok).toBe(false);
    const rfq = await db().rfq.findUniqueOrThrow({ where: { id: rfqId } });
    expect(rfq).toMatchObject({ status: "lost", lostReason: "Customer chose a cheaper source" });
  });

  it("the audit trail records every step in order with the right person", async () => {
    const { partId } = await makePart(est);
    const { quoteId } = await savedQuote(est, partId, BIG_VOLUME);
    await submitQuote(est, { quoteId });
    await decideQuote(head, { quoteId, action: "approve", comment: "ok" });
    await sendQuote(head, { quoteId });
    const trail = await auditFor("Quote", quoteId);
    expect(trail.map((t) => [t.action, t.userId])).toEqual([["quote.save", est.id], ["quote.submit", est.id], ["quote.approve", head.id], ["quote.send", head.id]]);
  });
});

describe("saving after a submit", () => {
  it("creates a new draft version and leaves the submitted one exactly as it was", async () => {
    const { partId } = await makePart(est);
    const v1 = await savedQuote(est, partId, BIG_VOLUME);
    await submitQuote(est, { quoteId: v1.quoteId });
    const before = await db().quote.findUniqueOrThrow({ where: { id: v1.quoteId } });
    const v2 = await savedQuote(est, partId, BIG_VOLUME, { markupPercent: "15" });
    const after = await db().quote.findUniqueOrThrow({ where: { id: v1.quoteId } });
    expect(after).toEqual(before);
    expect((await db().quote.findUniqueOrThrow({ where: { id: v2.quoteId } })).status).toBe("draft");
  });
});
