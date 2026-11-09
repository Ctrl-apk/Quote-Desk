import { describe, expect, it } from "vitest";
import { decideSubmit } from "@/lib/quote/submit";

describe("decideSubmit", () => {
  it("goes to the sales head above the threshold", () => {
    expect(decideSubmit({ status: "draft", isLatest: true, requiresApproval: true, unacceptedFields: [] })).toEqual({ ok: true, nextStatus: "pending_approval" });
  });

  it("becomes ready to send (not sent) at or below the threshold: only the sales head sends", () => {
    expect(decideSubmit({ status: "draft", isLatest: true, requiresApproval: false, unacceptedFields: [] })).toEqual({ ok: true, nextStatus: "ready_to_send" });
  });
  it("goes to pending approval above the threshold", () => {
    expect(decideSubmit({ status: "draft", isLatest: true, requiresApproval: true, unacceptedFields: [] })).toEqual({ ok: true, nextStatus: "pending_approval" });
  });

  it("is blocked by any unaccepted AI-filled value, naming them", () => {
    const r = decideSubmit({ status: "draft", isLatest: true, requiresApproval: false, unacceptedFields: ["material", "annual volume"] });
    expect(r).toMatchObject({ ok: false, reason: "unaccepted_values" });
    expect(r.ok ? "" : r.message).toBe("Accept or correct material, annual volume before submitting.");
  });

  it("the unaccepted check applies on the approval path too", () => {
    expect(decideSubmit({ status: "draft", isLatest: true, requiresApproval: true, unacceptedFields: ["material"] }).ok).toBe(false);
  });

  it("an older version cannot be submitted once a newer one exists", () => {
    expect(decideSubmit({ status: "draft", isLatest: false, requiresApproval: false, unacceptedFields: [] })).toMatchObject({ ok: false, reason: "superseded" });
  });

  it.each(["pending_approval", "approved", "rejected", "sent"] as const)("a %s version cannot be submitted again", (status) => {
    expect(decideSubmit({ status, isLatest: true, requiresApproval: false, unacceptedFields: [] })).toMatchObject({ ok: false, reason: "not_draft" });
  });
});
