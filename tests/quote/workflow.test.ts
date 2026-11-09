import { describe, expect, it } from "vitest";
import { canIssuePdf, decideApproval, decideOutcome, decideSend } from "@/lib/quote/workflow";

describe("decideApproval and superseded versions", () => {
  it("an old version cannot be approved but can be rejected with a reason", () => {
    expect(decideApproval({ status: "pending_approval", isLatest: false, action: "approve", comment: "ok" }).ok).toBe(false);
    expect(decideApproval({ status: "pending_approval", isLatest: false, action: "reject", comment: "Superseded by v3" })).toMatchObject({ ok: true, nextStatus: "rejected" });
  });
});

describe("decideApproval", () => {
  it("approves a pending quote, comment optional", () => {
    expect(decideApproval({ status: "pending_approval", isLatest: true, action: "approve", comment: "" })).toEqual({ ok: true, nextStatus: "approved", comment: "" });
  });
  it("rejection needs a reason", () => {
    expect(decideApproval({ status: "pending_approval", isLatest: true, action: "reject", comment: "  " }).ok).toBe(false);
    expect(decideApproval({ status: "pending_approval", isLatest: true, action: "reject", comment: "Freight too low" })).toMatchObject({ ok: true, nextStatus: "rejected" });
  });
  it.each(["draft", "approved", "rejected", "sent"] as const)("cannot decide a %s quote", (status) => {
    expect(decideApproval({ status, isLatest: true, action: "approve", comment: "ok" }).ok).toBe(false);
  });
  it("caps the comment length", () => expect(decideApproval({ status: "pending_approval", isLatest: true, action: "approve", comment: "x".repeat(501) }).ok).toBe(false));
});

describe("decideSend", () => {
  const base = { requiresApproval: true, isLatest: true };
  it("sends an approved latest quote", () => expect(decideSend({ ...base, status: "approved" }).ok).toBe(true));
  it("sends a ready-to-send quote that needs no approval", () => {
    expect(decideSend({ requiresApproval: false, isLatest: true, status: "ready_to_send" }).ok).toBe(true);
  });
  it("a quote that needs approval can never be sent from ready_to_send, and a no-approval quote cannot be sent from approved/draft", () => {
    expect(decideSend({ requiresApproval: true, isLatest: true, status: "ready_to_send" }).ok).toBe(false);
    expect(decideSend({ requiresApproval: false, isLatest: true, status: "draft" }).ok).toBe(false);
    expect(decideSend({ requiresApproval: false, isLatest: true, status: "approved" }).ok).toBe(false);
  });
  it("does not send a superseded ready-to-send version", () => {
    expect(decideSend({ requiresApproval: false, isLatest: false, status: "ready_to_send" }).ok).toBe(false);
  });
  it("never sends a quote that needs approval and has none", () => {
    for (const status of ["draft", "pending_approval", "rejected"] as const) expect(decideSend({ ...base, status }).ok).toBe(false);
  });
  it("does not send twice or a superseded version", () => {
    expect(decideSend({ ...base, status: "sent" }).ok).toBe(false);
    expect(decideSend({ ...base, status: "approved", isLatest: false }).ok).toBe(false);
  });
});

describe("canIssuePdf", () => {
  it("only once sent", () => {
    expect(["draft", "pending_approval", "approved", "ready_to_send", "rejected"].map((s) => canIssuePdf(s as never))).toEqual([false, false, false, false, false]);
    expect(canIssuePdf("sent")).toBe(true);
  });
});

describe("decideOutcome", () => {
  it("won needs no reason", () => expect(decideOutcome({ rfqStatus: "sent", outcome: "won", reason: "" })).toEqual({ ok: true, reason: null }));
  it("lost needs a reason and keeps it", () => {
    expect(decideOutcome({ rfqStatus: "sent", outcome: "lost", reason: "" }).ok).toBe(false);
    expect(decideOutcome({ rfqStatus: "sent", outcome: "lost", reason: " price " })).toEqual({ ok: true, reason: "price" });
  });
  it("only a sent RFQ can close", () => expect(decideOutcome({ rfqStatus: "estimating", outcome: "won", reason: "" }).ok).toBe(false));
});
