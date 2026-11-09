import { describe, expect, it } from "vitest";
import { addRateSchema, checkRateRules } from "@/lib/rates";

const today = "2026-11-04";
const material = { kind: "material", code: "EN8", effectiveFrom: "2026-12-01", ratePerKg: "72", scrapRecoveryPerKg: "26" } as const;

describe("addRateSchema", () => {
  it("accepts a valid material rate", () => expect(addRateSchema.safeParse(material).success).toBe(true));
  it("rejects negatives, exponents and text", () => {
    for (const bad of ["-1", "1e3", "abc", ""]) expect(addRateSchema.safeParse({ ...material, ratePerKg: bad }).success).toBe(false);
  });
  it("rejects an odd code", () => expect(addRateSchema.safeParse({ ...material, code: "<script>" }).success).toBe(false));
  it("rejects an unknown kind", () => expect(addRateSchema.safeParse({ ...material, kind: "labour" }).success).toBe(false));
});

describe("checkRateRules", () => {
  it("accepts a sensible rate", () => expect(checkRateRules(material, today)).toBeNull());
  it("rejects zero material rate", () => expect(checkRateRules({ ...material, ratePerKg: "0" }, today)).toMatch(/above zero/));
  it("rejects recovery above the rate", () => expect(checkRateRules({ ...material, scrapRecoveryPerKg: "80" }, today)).toMatch(/cannot exceed/));
  it("rejects efficiency outside (0, 1]", () => {
    const m = { kind: "machine", code: "CNC-T1", effectiveFrom: "2026-12-01", hourRate: "900", efficiency: "1.2" } as const;
    expect(checkRateRules(m, today)).toMatch(/Efficiency/);
    expect(checkRateRules({ ...m, efficiency: "0" }, today)).toMatch(/Efficiency/);
    expect(checkRateRules({ ...m, efficiency: "1" }, today)).toBeNull();
  });
  it("rejects overhead above 100", () => expect(checkRateRules({ kind: "overhead", code: "STANDARD", effectiveFrom: "2026-12-01", percent: "101" }, today)).toMatch(/100/));
  it("limits the date to a year either side of today", () => {
    expect(checkRateRules({ ...material, effectiveFrom: "2062-01-01" }, today)).toMatch(/within a year/);
    expect(checkRateRules({ ...material, effectiveFrom: "2025-01-01" }, today)).toMatch(/within a year/);
    expect(checkRateRules({ ...material, effectiveFrom: "2026-02-30" }, today)).toMatch(/does not exist/);
  });
});
