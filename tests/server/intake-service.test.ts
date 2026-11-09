import { beforeEach, describe, expect, it, vi } from "vitest";
import { MATERIAL_RATES } from "../../prisma/seed-data";
import type { SessionUser } from "@/lib/auth";
import { ExtractionError, type ExtractionProvider } from "@/lib/intake";

const repo = vi.hoisted(() => ({ createRfqWithPart: vi.fn(), listCustomerNames: vi.fn() }));
vi.mock("@/server/repositories/intake", () => repo);
vi.mock("@/server/repositories/parts", () => ({}));
vi.mock("@/server/repositories/quotes", () => ({}));
vi.mock("@/server/repositories/rates", () => ({ listAllRates: async () => ({ materials: MATERIAL_RATES.map((r, i) => ({ ...r, id: `m${i}` })), machines: [], overhead: [] }) }));
const service = await import("@/server/services/intake");

const estimator: SessionUser = { id: "e", email: "e@x.test", name: "E", role: "estimator" };
const salesHead: SessionUser = { id: "s", email: "s@x.test", name: "S", role: "sales_head" };
const today = "2026-11-04";
const email = "Subject: RFQ for rear wheel spindle\nEN8, gross weight 0.61 kg, 180000 pcs per year. Within a week.";

const fakeProvider = (extract: ExtractionProvider["extract"]): ExtractionProvider => ({ info: { id: "mock", label: "Mock extractor", description: "" }, extract });

beforeEach(() => { vi.clearAllMocks(); repo.createRfqWithPart.mockResolvedValue({ rfqId: "r", partId: "p", rfqNo: "RFQ-2611-028" }); });

describe("extractFromEmail", () => {
  it("is for estimators only", async () => {
    expect((await service.extractFromEmail(salesHead, { email }, fakeProvider(async () => ({})), today)).ok).toBe(false);
    expect((await service.extractFromEmail(null, { email }, fakeProvider(async () => ({})), today)).ok).toBe(false);
  });
  it("returns verified values and names the provider", async () => {
    const res = await service.extractFromEmail(estimator, { email }, fakeProvider(async () => ({ grossWeightKg: { value: "0.61", evidence: "gross weight 0.61 kg" }, annualVolume: { value: "999", evidence: "999 pcs" } })), today);
    expect(res).toMatchObject({ ok: true, provider: { label: "Mock extractor" } });
    if (res.ok) {
      expect(res.extraction.grossWeightKg?.value).toBe("0.61");
      expect(res.extraction.annualVolume).toBeUndefined();
      expect(res.warnings.length).toBe(1);
    }
  });
  it("shows a provider failure as a message, never falls back silently", async () => {
    const res = await service.extractFromEmail(estimator, { email }, fakeProvider(async () => { throw new ExtractionError("The AI service took too long."); }), today);
    expect(res).toEqual({ ok: false, error: "The AI service took too long.", field: undefined });
  });
  it("rejects a missing or oversized email", async () => {
    expect((await service.extractFromEmail(estimator, { email: "" }, fakeProvider(async () => ({})), today)).ok).toBe(false);
    expect((await service.extractFromEmail(estimator, { email: "x".repeat(20001) }, fakeProvider(async () => ({})), today)).ok).toBe(false);
  });
});

describe("createRfqFromIntake", () => {
  const body = { customer: "Company B", dueDate: "2026-11-11", sourceEmail: email, part: { name: "Rear wheel spindle", materialCode: "EN8", grossWeightKg: "0.61", annualVolume: "180000" }, suggested: { materialCode: "EN8" } };
  it("estimator only", async () => {
    expect((await service.createRfqFromIntake(salesHead, body, today)).ok).toBe(false);
    expect(repo.createRfqWithPart).not.toHaveBeenCalled();
  });
  it("creates and passes the suggestion through", async () => {
    const res = await service.createRfqFromIntake(estimator, body, today);
    expect(res).toMatchObject({ ok: true, rfqNo: "RFQ-2611-028" });
    expect(repo.createRfqWithPart).toHaveBeenCalledWith(expect.objectContaining({ suggested: { materialCode: "EN8" } }), "e", today);
  });
  it("validates", async () => {
    expect((await service.createRfqFromIntake(estimator, { ...body, customer: "" }, today)).ok).toBe(false);
    expect((await service.createRfqFromIntake(estimator, { ...body, dueDate: "2026-02-30" }, today)).ok).toBe(false);
    expect((await service.createRfqFromIntake(estimator, { ...body, part: { ...body.part, netWeightKg: "0.9" } }, today)).ok).toBe(false);
    expect((await service.createRfqFromIntake(estimator, { ...body, part: { ...body.part, annualVolume: "-5" } }, today)).ok).toBe(false);
    expect(repo.createRfqWithPart).not.toHaveBeenCalled();
  });
});
