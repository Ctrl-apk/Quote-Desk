import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";

const repo = vi.hoisted(() => ({
  listAllRates: vi.fn(), addRate: vi.fn(),
  RateExistsError: class RateExistsError extends Error {},
}));
vi.mock("@/server/repositories/rates", () => repo);
const { addRateVersion } = await import("@/server/services/rates");

const estimator: SessionUser = { id: "e", email: "e@x.test", name: "E", role: "estimator" };
const salesHead: SessionUser = { id: "s", email: "s@x.test", name: "S", role: "sales_head" };
const payload = { kind: "material", code: "EN8", effectiveFrom: "2026-12-01", ratePerKg: "72", scrapRecoveryPerKg: "26" };
const today = "2026-11-04";

beforeEach(() => {
  vi.clearAllMocks();
  repo.listAllRates.mockResolvedValue({ materials: [{ id: "1", materialCode: "EN8", ratePerKg: "70", scrapRecoveryPerKg: "25", effectiveFrom: "2026-01-01" }], machines: [], overhead: [] });
});

describe("addRateVersion", () => {
  it("refuses signed-out and estimator, writes nothing", async () => {
    expect((await addRateVersion(null, payload, today)).ok).toBe(false);
    const res = await addRateVersion(estimator, payload, today);
    expect(res).toMatchObject({ ok: false });
    expect(repo.addRate).not.toHaveBeenCalled();
  });
  it("lets the sales head add a rate", async () => {
    expect(await addRateVersion(salesHead, payload, today)).toEqual({ ok: true });
    expect(repo.addRate).toHaveBeenCalledWith(expect.objectContaining({ code: "EN8", ratePerKg: "72" }), "s");
  });
  it("rejects a date that already has a rate, with a clear message", async () => {
    const res = await addRateVersion(salesHead, { ...payload, effectiveFrom: "2026-01-01" }, today);
    expect(res).toMatchObject({ ok: false, field: "effectiveFrom" });
    expect(repo.addRate).not.toHaveBeenCalled();
  });
  it("maps a database unique violation to the same friendly message", async () => {
    repo.addRate.mockRejectedValue(new repo.RateExistsError());
    expect(await addRateVersion(salesHead, payload, today)).toMatchObject({ ok: false, field: "effectiveFrom" });
  });
  it("rejects invalid input before touching the database", async () => {
    expect((await addRateVersion(salesHead, { ...payload, ratePerKg: "-5" }, today)).ok).toBe(false);
    expect(repo.listAllRates).not.toHaveBeenCalled();
  });
});
