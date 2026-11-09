import { beforeAll, describe, expect, it } from "vitest";
import { suggestRouting } from "@/server/services/past-quotes";
import { db, makeUser } from "./helpers";

describe("routing suggestion from past quotes", () => {
  let est: Awaited<ReturnType<typeof makeUser>>;
  let head: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    est = await makeUser("estimator");
    head = await makeUser("sales_head");
    await db().pastQuote.deleteMany();
    const row = (over: object) => ({ customer: "Hist Co", partName: "Hist spindle", materialCode: "EN8", grossWeightKg: "0.6000", routing: [{ operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "3.0" }], pricePerUnit: "100.00", quoteRef: "H-1", quotedOn: new Date("2025-05-01T00:00:00Z"), importKey: "k1", ...over });
    await db().pastQuote.createMany({
      data: [
        row({}),
        row({ partName: "Hist closer", grossWeightKg: "0.6100", quoteRef: "H-2", importKey: "k2", routing: [{ operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "3.3" }, { operation: "Drilling", machineCode: "DRL-1", cycleTimeMin: "0.6" }] }),
        row({ partName: "Different material", materialCode: "40Cr4", grossWeightKg: "0.6100", quoteRef: "H-3", importKey: "k3" }),
        row({ partName: "Too heavy", grossWeightKg: "0.9000", quoteRef: "H-4", importKey: "k4" }),
      ],
    });
  });

  it("returns the closest-weight past quote with its reference, never the wrong material or a weight outside 10%", async () => {
    const r = await suggestRouting(est, { materialCode: "EN8", grossWeightKg: "0.61" });
    expect(r.ok).toBe(true);
    if (!r.ok || !r.suggestion) throw new Error("expected a suggestion");
    expect(r.suggestion.reference).toMatchObject({ partName: "Hist closer", quoteRef: "H-2", customer: "Hist Co", materialCode: "EN8" });
    expect(r.suggestion.steps).toHaveLength(2);
  });

  it("says there is nothing rather than inventing a routing", async () => {
    const r = await suggestRouting(est, { materialCode: "EN8", grossWeightKg: "5" });
    expect(r).toEqual({ ok: true, suggestion: null });
  });

  it("applying a suggestion changes nothing in the database", async () => {
    const before = await db().pastQuote.count();
    await suggestRouting(est, { materialCode: "EN8", grossWeightKg: "0.61" });
    expect(await db().pastQuote.count()).toBe(before);
    expect(await db().routingStep.count({ where: { operation: "Drilling", cycleTimeMin: "0.6" } })).toBe(0);
  });

  it("needs a signed-in user, and rejects bad input", async () => {
    expect((await suggestRouting(null, { materialCode: "EN8", grossWeightKg: "0.61" })).ok).toBe(false);
    expect((await suggestRouting(head, { materialCode: "EN8", grossWeightKg: "0.61" })).ok).toBe(true);
    expect((await suggestRouting(est, { materialCode: "", grossWeightKg: "x" })).ok).toBe(false);
  });
});
