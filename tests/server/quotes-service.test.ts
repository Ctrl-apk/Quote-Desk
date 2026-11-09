import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";

// The state rules and the races are tested against Postgres in tests/integration. Here: roles and input handling.
const workflow = vi.hoisted(() => ({ decideQuoteAtomic: vi.fn(), sendQuoteAtomic: vi.fn(), markOutcomeAtomic: vi.fn() }));
vi.mock("@/server/repositories/workflow", () => workflow);
vi.mock("@/server/repositories/quotes", () => ({}));
vi.mock("@/server/repositories/parts", () => ({}));
vi.mock("@/server/repositories/rates", () => ({}));
const service = await import("@/server/services/quotes");

const estimator: SessionUser = { id: "e", email: "e@x.test", name: "E", role: "estimator" };
const salesHead: SessionUser = { id: "s", email: "s@x.test", name: "S", role: "sales_head" };
const SIGN_IN = { ok: false, error: "Sign in to continue" };
const NO_PERMISSION = { ok: false, error: "You do not have permission to do this" };

beforeEach(() => {
  vi.clearAllMocks();
  workflow.decideQuoteAtomic.mockResolvedValue({ ok: true, status: "approved" });
  workflow.sendQuoteAtomic.mockResolvedValue({ ok: true });
  workflow.markOutcomeAtomic.mockResolvedValue({ ok: true });
});

describe("decideQuote", () => {
  it("only the sales head can decide; an estimator or a signed-out caller is refused and nothing is called", async () => {
    expect(await service.decideQuote(estimator, { quoteId: "q1", action: "approve" })).toMatchObject(NO_PERMISSION);
    expect(await service.decideQuote(null, { quoteId: "q1", action: "approve" })).toMatchObject(SIGN_IN);
    expect(workflow.decideQuoteAtomic).not.toHaveBeenCalled();
  });
  it("passes the sales head's identity, action and comment to the atomic call", async () => {
    expect(await service.decideQuote(salesHead, { quoteId: "q1", action: "approve" })).toEqual({ ok: true, status: "approved" });
    expect(workflow.decideQuoteAtomic).toHaveBeenCalledWith("q1", "s", "approve", "");
  });
  it("shows the repository's refusal, such as a missing remark or a lost race", async () => {
    workflow.decideQuoteAtomic.mockResolvedValue({ ok: false, message: "Give a reason so the estimator knows what to change." });
    expect(await service.decideQuote(salesHead, { quoteId: "q1", action: "reject", comment: "" })).toEqual({ ok: false, error: "Give a reason so the estimator knows what to change." });
  });
  it("rejects unknown actions and malformed payloads before any database call", async () => {
    expect((await service.decideQuote(salesHead, { quoteId: "q1", action: "delete" })).ok).toBe(false);
    expect((await service.decideQuote(salesHead, null)).ok).toBe(false);
    expect(workflow.decideQuoteAtomic).not.toHaveBeenCalled();
  });
});

describe("sendQuote", () => {
  it("only the sales head may send; an estimator or a signed-out caller is refused and nothing is called", async () => {
    expect(await service.sendQuote(estimator, { quoteId: "q1" })).toMatchObject(NO_PERMISSION);
    expect(await service.sendQuote(null, { quoteId: "q1" })).toMatchObject(SIGN_IN);
    expect(workflow.sendQuoteAtomic).not.toHaveBeenCalled();
    expect((await service.sendQuote(salesHead, { quoteId: "q1" })).ok).toBe(true);
    expect(workflow.sendQuoteAtomic).toHaveBeenCalledWith("q1", "s");
  });
  it("shows a refusal", async () => {
    workflow.sendQuoteAtomic.mockResolvedValue({ ok: false, message: "This quote needs approval before it is sent." });
    expect(await service.sendQuote(salesHead, { quoteId: "q1" })).toEqual({ ok: false, error: "This quote needs approval before it is sent." });
  });
});

describe("markOutcome", () => {
  it("the sales head cannot; the estimator can", async () => {
    expect(await service.markOutcome(salesHead, { quoteId: "q1", outcome: "won" })).toMatchObject(NO_PERMISSION);
    expect((await service.markOutcome(estimator, { quoteId: "q1", outcome: "lost", reason: "price" })).ok).toBe(true);
    expect(workflow.markOutcomeAtomic).toHaveBeenCalledWith("q1", "e", "lost", "price");
  });
});
