import { describe, expect, it } from "vitest";
import { CostInputError, D, calculateQuoteCost, conversionCostPerUnit, materialCostPerUnit, requiresApproval, tierVolume, type QuoteCostInput } from "@/lib/cost-engine";

/** Boundary and hostile-input tests for the engine (review item: financial validation). */
const base: QuoteCostInput = {
  annualVolume: 1000,
  material: { grossWeightKg: 1, netWeightKg: 0.8, ratePerKg: 100, scrapRecoveryPerKg: 40, scrapPercent: 0 },
  routing: [{ cycleTimeMin: 6, hourRate: 600, efficiency: 1 }],
  setupCost: 0,
  toolingCost: 0,
  overheadPercent: 0,
  packingPerUnit: 0,
  freightPerUnit: [0, 0, 0],
  markupPercent: 0,
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof CostInputError ? e.code : `OTHER:${String(e)}`;
  }
  return "NO_ERROR";
};
const hostile: [string, unknown][] = [["NaN", Number.NaN], ["Infinity", Infinity], ["-Infinity", -Infinity], ['"NaN"', "NaN"], ['"Infinity"', "Infinity"], ["text", "abc"], ["empty", ""], ["null", null], ["undefined", undefined]];

describe("negative material cost can never happen", () => {
  it("rejects a recovery rate above the material rate", () => {
    expect(code(() => materialCostPerUnit({ grossWeightKg: 1, netWeightKg: 0.01, ratePerKg: 10, scrapRecoveryPerKg: 50 }))).toBe("RECOVERY_EXCEEDS_RATE");
  });
  it("allows recovery equal to the rate and the result stays above zero", () => {
    const cost = materialCostPerUnit({ grossWeightKg: 1, netWeightKg: 0.01, ratePerKg: 50, scrapRecoveryPerKg: 50 });
    expect(cost.toFixed(2)).toBe("0.50");
    expect(cost.gt(0)).toBe(true);
  });
  it("holds for a sweep of weights and recovery rates up to the rate", () => {
    for (const net of [0.0001, 0.01, 0.5, 0.9999, 1]) {
      for (const rec of [0, 1, 49.99, 50]) {
        const cost = materialCostPerUnit({ grossWeightKg: 1, netWeightKg: net, ratePerKg: 50, scrapRecoveryPerKg: rec, scrapPercent: 0 });
        expect(cost.gt(0)).toBe(true);
      }
    }
  });
  it("flows through the full quote as an input error", () => {
    expect(code(() => calculateQuoteCost({ ...base, material: { ...base.material, ratePerKg: 10, scrapRecoveryPerKg: 11 } }))).toBe("RECOVERY_EXCEEDS_RATE");
  });
});

describe("hostile values are rejected everywhere, never turned into a price", () => {
  for (const [label, value] of hostile) {
    it(`gross weight ${label}`, () => expect(code(() => calculateQuoteCost({ ...base, material: { ...base.material, grossWeightKg: value as number } }))).not.toBe("NO_ERROR"));
    it(`net weight ${label}`, () => expect(code(() => calculateQuoteCost({ ...base, material: { ...base.material, netWeightKg: value as number } }))).not.toBe("NO_ERROR"));
    it(`material rate ${label}`, () => expect(code(() => calculateQuoteCost({ ...base, material: { ...base.material, ratePerKg: value as number } }))).not.toBe("NO_ERROR"));
    it(`cycle time ${label}`, () => expect(code(() => calculateQuoteCost({ ...base, routing: [{ cycleTimeMin: value as number, hourRate: 600, efficiency: 1 }] }))).not.toBe("NO_ERROR"));
    it(`machine efficiency ${label}`, () => expect(code(() => calculateQuoteCost({ ...base, routing: [{ cycleTimeMin: 6, hourRate: 600, efficiency: value as number }] }))).not.toBe("NO_ERROR"));
    it(`annual volume ${label}`, () => expect(code(() => calculateQuoteCost({ ...base, annualVolume: value as number }))).not.toBe("NO_ERROR"));
    it(`markup ${label}`, () => expect(code(() => calculateQuoteCost({ ...base, markupPercent: value as number }))).not.toBe("NO_ERROR"));
  }
  it("zero and negative values in every positive field", () => {
    for (const v of [0, -1]) {
      expect(code(() => calculateQuoteCost({ ...base, annualVolume: v }))).not.toBe("NO_ERROR");
      expect(code(() => calculateQuoteCost({ ...base, material: { ...base.material, grossWeightKg: v } }))).not.toBe("NO_ERROR");
      expect(code(() => calculateQuoteCost({ ...base, material: { ...base.material, netWeightKg: v } }))).not.toBe("NO_ERROR");
      expect(code(() => calculateQuoteCost({ ...base, routing: [{ cycleTimeMin: v, hourRate: 600, efficiency: 1 }] }))).not.toBe("NO_ERROR");
    }
  });
  it("negative one-off, packing, freight and percentages", () => {
    expect(code(() => calculateQuoteCost({ ...base, setupCost: -1 }))).not.toBe("NO_ERROR");
    expect(code(() => calculateQuoteCost({ ...base, toolingCost: -1 }))).not.toBe("NO_ERROR");
    expect(code(() => calculateQuoteCost({ ...base, packingPerUnit: -0.01 }))).not.toBe("NO_ERROR");
    expect(code(() => calculateQuoteCost({ ...base, freightPerUnit: [0, -1, 0] }))).not.toBe("NO_ERROR");
    expect(code(() => calculateQuoteCost({ ...base, overheadPercent: -1 }))).not.toBe("NO_ERROR");
    expect(code(() => calculateQuoteCost({ ...base, markupPercent: -1 }))).not.toBe("NO_ERROR");
    expect(code(() => calculateQuoteCost({ ...base, gstPercent: -1 }))).not.toBe("NO_ERROR");
  });
});

describe("weight constraints", () => {
  it("net equal to gross is allowed; one ten-thousandth above is not", () => {
    expect(code(() => materialCostPerUnit({ grossWeightKg: 1, netWeightKg: 1, ratePerKg: 10, scrapRecoveryPerKg: 0 }))).toBe("NO_ERROR");
    expect(code(() => materialCostPerUnit({ grossWeightKg: 1, netWeightKg: "1.0001", ratePerKg: 10, scrapRecoveryPerKg: 0 }))).toBe("NET_EXCEEDS_GROSS");
  });
});

describe("machine cycle time and efficiency (OEE)", () => {
  it("cost = cycle minutes ÷ 60 × hour rate ÷ efficiency", () => {
    expect(conversionCostPerUnit([{ cycleTimeMin: 6, hourRate: 600, efficiency: 1 }]).toFixed(2)).toBe("60.00");
    expect(conversionCostPerUnit([{ cycleTimeMin: 6, hourRate: 600, efficiency: 0.8 }]).toFixed(2)).toBe("75.00");
    expect(conversionCostPerUnit([{ cycleTimeMin: 6, hourRate: 600, efficiency: 0.5 }]).toFixed(2)).toBe("120.00");
  });
  it("efficiency just above zero is accepted, zero and above one are not", () => {
    expect(code(() => conversionCostPerUnit([{ cycleTimeMin: 1, hourRate: 60, efficiency: "0.0001" }]))).toBe("NO_ERROR");
    expect(code(() => conversionCostPerUnit([{ cycleTimeMin: 1, hourRate: 60, efficiency: 0 }]))).toBe("NOT_POSITIVE");
    expect(code(() => conversionCostPerUnit([{ cycleTimeMin: 1, hourRate: 60, efficiency: "1.0001" }]))).toBe("EFFICIENCY_RANGE");
  });
  it("sums several operations before rounding once", () => {
    expect(conversionCostPerUnit([{ cycleTimeMin: 1, hourRate: 10, efficiency: 1 }, { cycleTimeMin: 1, hourRate: 10, efficiency: 1 }, { cycleTimeMin: 1, hourRate: 10, efficiency: 1 }]).toFixed(2)).toBe("0.50");
  });
});

describe("setup and tooling amortisation across volume tiers", () => {
  const q = calculateQuoteCost({ ...base, annualVolume: 1000, setupCost: 3000, toolingCost: 7000 });
  it("divides the one-off total by each tier's own volume", () => {
    expect(q.tiers.map((t) => t.volume.toString())).toEqual(["500", "1000", "1500"]);
    expect(q.tiers.map((t) => t.setupTooling.toFixed(2))).toEqual(["20.00", "10.00", "6.67"]);
  });
  it("tier volumes round half-up and never fall below one piece", () => {
    expect(tierVolume(new D(3), "0.5").toString()).toBe("2");
    expect(tierVolume(new D(1), "0.5").toString()).toBe("1");
  });
  it("zero one-off costs give zero amortisation", () => {
    expect(calculateQuoteCost(base).tiers.every((t) => t.setupTooling.isZero())).toBe(true);
  });
});

describe("markup, GST and annual value", () => {
  it("markup is on cost; GST is on the marked-up price; annual value excludes GST", () => {
    const t = calculateQuoteCost({ ...base, markupPercent: 10, gstPercent: 18 }).tiers[1]!;
    // material 100 − 0.2 × 40 = 92, conversion 60, total 152
    expect(t.totalCost.toFixed(2)).toBe("152.00");
    expect(t.markup.toFixed(2)).toBe("15.20");
    expect(t.pricePerUnit.toFixed(2)).toBe("167.20");
    expect(t.gst.toFixed(2)).toBe("30.10");
    expect(t.annualValue.toFixed(2)).toBe("167200.00");
  });
  it("zero markup and zero GST are valid", () => {
    const t = calculateQuoteCost({ ...base, markupPercent: 0, gstPercent: 0 }).tiers[1]!;
    expect(t.pricePerUnit.toFixed(2)).toBe("152.00");
    expect(t.gst.toFixed(2)).toBe("0.00");
  });
  it("the approval threshold applies to the pre-GST 1× value only", () => {
    expect(requiresApproval("2500000.00")).toBe(false);
    expect(requiresApproval("2500000.01")).toBe(true);
  });
});

describe("precision and rounding are consistent", () => {
  it("rounds half-up to paise on a value that floats misround", () => {
    expect(materialCostPerUnit({ grossWeightKg: "1.005", netWeightKg: "1.005", ratePerKg: 1, scrapRecoveryPerKg: 0 }).toFixed(2)).toBe("1.01");
  });
  it("very large and very small valid values keep exact decimals", () => {
    const big = calculateQuoteCost({ ...base, annualVolume: 1_000_000_000, material: { ...base.material, ratePerKg: 99999 } });
    expect(big.tiers[1]!.annualValue.isFinite()).toBe(true);
    const tiny = materialCostPerUnit({ grossWeightKg: "0.0001", netWeightKg: "0.0001", ratePerKg: "0.01", scrapRecoveryPerKg: 0 });
    expect(tiny.toFixed(2)).toBe("0.00");
  });
});
