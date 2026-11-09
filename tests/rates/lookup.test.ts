import { describe, expect, it } from "vitest";
import {
  InvalidDateError,
  RateDateExistsError,
  RateNotFoundError,
  assertRateDateFree,
  lookupMachineRate,
  lookupMaterialRate,
  lookupOverheadRate,
} from "@/lib/rates";
import type { MachineRateRow, MaterialRateRow, OverheadRateRow } from "@/lib/rates";

const en8 = (id: string, effectiveFrom: string, ratePerKg: string): MaterialRateRow => ({
  id, materialCode: "EN8", ratePerKg, scrapRecoveryPerKg: "25", effectiveFrom,
});

// Deliberately out of order: lookup must not depend on row order.
const materials: MaterialRateRow[] = [
  en8("m-oct", "2026-10-01", "76"),
  en8("m-apr", "2026-04-01", "70"),
  { id: "k-apr", materialCode: "40Cr4", ratePerKg: "82", scrapRecoveryPerKg: "27", effectiveFrom: "2026-04-01" },
];

describe("lookupMaterialRate", () => {
  it("uses the latest rate on or before the quote date", () => {
    expect(lookupMaterialRate(materials, "EN8", "2026-06-15").id).toBe("m-apr");
    expect(lookupMaterialRate(materials, "EN8", "2026-11-02").id).toBe("m-oct");
  });

  it("applies a rate on its own effective date (same-day, inclusive)", () => {
    expect(lookupMaterialRate(materials, "EN8", "2026-10-01").id).toBe("m-oct");
    expect(lookupMaterialRate(materials, "EN8", "2026-04-01").id).toBe("m-apr");
  });

  it("does not apply a rate the day before it starts", () => {
    expect(lookupMaterialRate(materials, "EN8", "2026-09-30").id).toBe("m-apr");
  });

  it("keeps codes separate", () => {
    expect(lookupMaterialRate(materials, "40Cr4", "2026-11-02").id).toBe("k-apr");
  });

  it("errors clearly when the date is before the first rate", () => {
    const run = () => lookupMaterialRate(materials, "EN8", "2026-03-31");
    expect(run).toThrow(RateNotFoundError);
    expect(run).toThrow(/No material rate for EN8 on or before 2026-03-31.*starts 2026-04-01/);
  });

  it("errors clearly when the code has no rates at all", () => {
    expect(() => lookupMaterialRate(materials, "20MnCr5", "2026-11-02")).toThrow(/No material rate exists for 20MnCr5/);
  });

  it("rejects malformed dates", () => {
    expect(() => lookupMaterialRate(materials, "EN8", "02/11/2026")).toThrow(InvalidDateError);
    expect(() => lookupMaterialRate(materials, "EN8", "2026-02-30")).toThrow(InvalidDateError);
  });
});

describe("machine and overhead lookup", () => {
  const machines: MachineRateRow[] = [
    { id: "c1", machineCode: "CNC-1", hourRate: "850", efficiency: "0.85", effectiveFrom: "2026-04-01" },
    { id: "c2", machineCode: "CNC-1", hourRate: "900", efficiency: "0.85", effectiveFrom: "2026-10-01" },
  ];
  const overhead: OverheadRateRow[] = [
    { id: "o1", category: "STANDARD", percent: "12", effectiveFrom: "2026-04-01" },
  ];

  it("finds the effective machine rate by date", () => {
    expect(lookupMachineRate(machines, "CNC-1", "2026-09-01").hourRate).toBe("850");
    expect(lookupMachineRate(machines, "CNC-1", "2026-10-01").hourRate).toBe("900");
  });

  it("errors for an unknown machine", () => {
    expect(() => lookupMachineRate(machines, "VMC-9", "2026-11-02")).toThrow(RateNotFoundError);
  });

  it("finds the overhead rate and errors before it starts", () => {
    expect(lookupOverheadRate(overhead, "STANDARD", "2026-11-02").percent).toBe("12");
    expect(() => lookupOverheadRate(overhead, "STANDARD", "2026-01-01")).toThrow(/overhead rate/);
  });
});

describe("assertRateDateFree", () => {
  it("rejects a second rate on a date that already has one", () => {
    expect(() => assertRateDateFree("material", "EN8", "2026-10-01", ["2026-04-01", "2026-10-01"])).toThrow(RateDateExistsError);
    expect(() => assertRateDateFree("material", "EN8", "2026-10-01", ["2026-10-01"])).toThrow(/choose a later effective date/);
  });

  it("allows a new date", () => {
    expect(() => assertRateDateFree("material", "EN8", "2026-11-01", ["2026-04-01", "2026-10-01"])).not.toThrow();
  });
});
