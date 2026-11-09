import { beforeEach, describe, expect, it, vi } from "vitest";
import { MACHINE_RATES, MATERIAL_RATES, OVERHEAD_RATES } from "../../prisma/seed-data";
import type { SessionUser } from "@/lib/auth";
import type { CostingForm } from "@/lib/costing/form";

const withIds = <T extends object>(rows: T[], p: string) => rows.map((r, i) => ({ ...r, id: `${p}-${i}` }));

const parts = vi.hoisted(() => ({
  getPartValues: vi.fn(), applyManualField: vi.fn(), acceptAiField: vi.fn(), listUnacceptedFields: vi.fn(),
}));
const quotes = vi.hoisted(() => ({
  saveVersion: vi.fn(),
  VersionConflictError: class VersionConflictError extends Error {},
}));
vi.mock("@/server/repositories/parts", () => parts);
const workflow = vi.hoisted(() => ({ submitQuoteAtomic: vi.fn() }));
vi.mock("@/server/repositories/quotes", () => quotes);
vi.mock("@/server/repositories/workflow", () => workflow);
vi.mock("@/server/repositories/rates", () => ({
  listAllRates: async () => ({ materials: withIds(MATERIAL_RATES, "m"), machines: withIds(MACHINE_RATES, "k"), overhead: withIds(OVERHEAD_RATES, "o") }),
}));

const service = await import("@/server/services/costing");

const estimator: SessionUser = { id: "u-est", email: "e@x.test", name: "Est", role: "estimator" };
const salesHead: SessionUser = { id: "u-sh", email: "s@x.test", name: "SH", role: "sales_head" };

const form: CostingForm = {
  quotedOn: "2026-11-03", materialCode: "EN8", grossWeightKg: "0.61", netWeightKg: "0.52", annualVolume: "180000",
  setupCost: "50000", toolingCost: "150000",
  routing: [{ operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "3.2" }],
  scrapPercent: "2", overheadPercent: "12", packingPerUnit: "1.50", freightPerUnit: ["2.00", "2.00", "2.00"],
  markupPercent: "10", gstPercent: "18",
};
const stored = { materialCode: "EN8", grossWeightKg: "0.6100", netWeightKg: "0.5200", annualVolume: 180000 };

beforeEach(() => {
  vi.clearAllMocks();
  parts.getPartValues.mockResolvedValue(stored);
  quotes.saveVersion.mockResolvedValue({ id: "q1", version: 3 });
});

describe("saveQuoteVersion", () => {
  it("recomputes the price on the server and stores that, not anything the client sent", async () => {
    const r = await service.saveQuoteVersion(estimator, { partId: "p1", form, annualValue: "1.00", requiresApproval: false, volumeTiers: [] });
    expect(r).toEqual({ ok: true, quoteId: "q1", version: 3 });
    const saved = quotes.saveVersion.mock.calls[0]![0];
    expect(saved.annualValue).toBe("19846800.00");
    expect(saved.requiresApproval).toBe(true);
    expect(saved.volumeTiers[1]).toMatchObject({ pricePerUnit: "110.26" });
    expect(saved.userId).toBe("u-est");
  });

  it("stores the rate rows used and their values", async () => {
    await service.saveQuoteVersion(estimator, { partId: "p1", form });
    const saved = quotes.saveVersion.mock.calls[0]![0];
    expect(saved.ratesSnapshot.materials[0]).toMatchObject({ materialCode: "EN8", ratePerKg: "76.0000" });
    expect(saved.rateRowIds.materials).toHaveLength(1);
    expect(saved.rateRowIds.machines).toHaveLength(1);
  });

  it("a sales head cannot save, and nothing is written", async () => {
    const r = await service.saveQuoteVersion(salesHead, { partId: "p1", form });
    expect(r).toEqual({ ok: false, error: "You do not have permission to do this" });
    expect(quotes.saveVersion).not.toHaveBeenCalled();
  });

  it("a signed-out caller cannot save", async () => {
    expect(await service.saveQuoteVersion(null, { partId: "p1", form })).toEqual({ ok: false, error: "Sign in to continue" });
    expect(quotes.saveVersion).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads before touching the database", async () => {
    for (const bad of [null, {}, { partId: "p1" }, { partId: "p1", form: { ...form, grossWeightKg: "1e9" } }]) {
      expect((await service.saveQuoteVersion(estimator, bad)).ok).toBe(false);
    }
    expect(parts.getPartValues).not.toHaveBeenCalled();
  });

  it("returns the engine's message for impossible inputs, with the field", async () => {
    const r = await service.saveQuoteVersion(estimator, { partId: "p1", form: { ...form, netWeightKg: "0.9" } });
    expect(r).toMatchObject({ ok: false, error: "Net weight cannot exceed gross weight", field: "netWeightKg" });
    expect(quotes.saveVersion).not.toHaveBeenCalled();
  });

  it("returns a clear message when no rate exists for the quote date", async () => {
    const r = await service.saveQuoteVersion(estimator, { partId: "p1", form: { ...form, quotedOn: "2026-01-01" } });
    expect(r.ok ? "" : r.error).toMatch(/No material rate for EN8 on or before 2026-01-01/);
  });

  it("fails cleanly when the part is gone", async () => {
    parts.getPartValues.mockResolvedValue(null);
    expect(await service.saveQuoteVersion(estimator, { partId: "p1", form })).toEqual({ ok: false, error: "This part no longer exists." });
  });

  it("reports a version race instead of failing", async () => {
    quotes.saveVersion.mockRejectedValue(new quotes.VersionConflictError());
    expect((await service.saveQuoteVersion(estimator, { partId: "p1", form })).ok).toBe(false);
  });

  it("lets real bugs surface rather than hiding them as validation errors", async () => {
    quotes.saveVersion.mockRejectedValue(new Error("connection lost"));
    await expect(service.saveQuoteVersion(estimator, { partId: "p1", form })).rejects.toThrow("connection lost");
  });
});

describe("changedPartFields", () => {
  it("is empty when the form matches what is stored, ignoring trailing zeros", () => {
    expect(service.changedPartFields(stored, form)).toEqual([]);
  });
  it("lists exactly the fields that differ", () => {
    expect(service.changedPartFields(stored, { ...form, materialCode: "40Cr4", netWeightKg: "0.50" })).toEqual(["materialCode", "netWeightKg"]);
    expect(service.changedPartFields(stored, { ...form, annualVolume: "200000" })).toEqual(["annualVolume"]);
  });
  it("treats a missing stored value as changed", () => {
    expect(service.changedPartFields({ ...stored, grossWeightKg: null }, form)).toEqual(["grossWeightKg"]);
  });
});

describe("updatePartField", () => {
  it("stores a corrected value as a manual edit", async () => {
    const r = await service.updatePartField(estimator, { partId: "p1", field: "grossWeightKg", value: "0.65" });
    expect(r).toEqual({ ok: true });
    expect(parts.applyManualField).toHaveBeenCalledWith("p1", "grossWeightKg", "0.65", expect.any(String));
  });
  it("rejects net weight above gross, whichever one is edited", async () => {
    expect((await service.updatePartField(estimator, { partId: "p1", field: "netWeightKg", value: "0.9" })).ok).toBe(false);
    expect((await service.updatePartField(estimator, { partId: "p1", field: "grossWeightKg", value: "0.4" })).ok).toBe(false);
    expect(parts.applyManualField).not.toHaveBeenCalled();
  });
  it("ignores a client-supplied accepted flag or source", async () => {
    await service.updatePartField(estimator, { partId: "p1", field: "materialCode", value: "EN8", accepted: true, source: "email" });
    expect(parts.applyManualField).toHaveBeenCalledWith("p1", "materialCode", "EN8", expect.any(String));
  });
  it("a sales head cannot edit part details", async () => {
    expect((await service.updatePartField(salesHead, { partId: "p1", field: "materialCode", value: "EN8" })).ok).toBe(false);
    expect(parts.applyManualField).not.toHaveBeenCalled();
  });
});

describe("acceptPartField", () => {
  it("accepts an AI-filled value", async () => {
    parts.acceptAiField.mockResolvedValue(true);
    expect(await service.acceptPartField(estimator, { partId: "p1", field: "materialCode" })).toEqual({ ok: true });
  });
  it("says so when there is nothing to accept", async () => {
    parts.acceptAiField.mockResolvedValue(false);
    expect((await service.acceptPartField(estimator, { partId: "p1", field: "materialCode" })).ok).toBe(false);
  });
  it("a sales head cannot accept on the estimator's behalf", async () => {
    expect((await service.acceptPartField(salesHead, { partId: "p1", field: "materialCode" })).ok).toBe(false);
    expect(parts.acceptAiField).not.toHaveBeenCalled();
  });
});

describe("submitQuote (rules and races are tested against Postgres in tests/integration)", () => {
  it("returns the new status from the atomic repository call", async () => {
    workflow.submitQuoteAtomic.mockResolvedValue({ ok: true, status: "pending_approval" });
    expect(await service.submitQuote(estimator, { quoteId: "q1" })).toEqual({ ok: true, status: "pending_approval" });
    expect(workflow.submitQuoteAtomic).toHaveBeenCalledWith("q1", "u-est");
  });

  it("passes the repository's refusal message to the user", async () => {
    workflow.submitQuoteAtomic.mockResolvedValue({ ok: false, message: "Accept or correct material before submitting." });
    expect(await service.submitQuote(estimator, { quoteId: "q1" })).toEqual({ ok: false, error: "Accept or correct material before submitting." });
  });

  it("a sales head cannot submit quotes, and nothing is called", async () => {
    expect(await service.submitQuote(salesHead, { quoteId: "q1" })).toMatchObject({ ok: false, error: "You do not have permission to do this" });
    expect(await service.submitQuote(null, { quoteId: "q1" })).toMatchObject({ ok: false, error: "Sign in to continue" });
    expect(workflow.submitQuoteAtomic).not.toHaveBeenCalled();
  });

  it("rejects a malformed payload without touching the database", async () => {
    expect((await service.submitQuote(estimator, { quoteId: 42 })).ok).toBe(false);
    expect((await service.submitQuote(estimator, null)).ok).toBe(false);
    expect(workflow.submitQuoteAtomic).not.toHaveBeenCalled();
  });
});
