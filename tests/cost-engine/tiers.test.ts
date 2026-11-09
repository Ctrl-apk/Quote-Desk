import { describe, expect, it } from "vitest";
import {
  CostInputError,
  D,
  DEFAULT_GST_PERCENT,
  VOLUME_TIER_FACTORS,
  calculateQuoteCost,
  tierVolume,
  type QuoteCostInput,
} from "@/lib/cost-engine";

/** The worked example approved in review (spindle, invented rates). */
const spindle: QuoteCostInput = {
  annualVolume: 180000,
  material: { grossWeightKg: 0.61, netWeightKg: 0.5, ratePerKg: 70, scrapRecoveryPerKg: 25, scrapPercent: 3 },
  routing: [{ cycleTimeMin: 3.2, hourRate: 850, efficiency: 1 }],
  setupCost: 50000,
  toolingCost: 150000,
  overheadPercent: 12,
  packingPerUnit: 1.5,
  freightPerUnit: [2, 2, 2],
  markupPercent: 10,
};

const f2 = (v: { toFixed(n: number): string }) => v.toFixed(2);
const codeOf = (input: QuoteCostInput) => {
  try {
    calculateQuoteCost(input);
  } catch (e) {
    return e instanceof CostInputError ? e.code : "OTHER";
  }
  return "NO_ERROR";
};

describe("calculateQuoteCost: approved worked example", () => {
  const { tiers } = calculateQuoteCost(spindle);

  it("uses 0.5×, 1× and 1.5× volumes", () => {
    expect(VOLUME_TIER_FACTORS).toEqual(["0.5", "1", "1.5"]);
    expect(tiers.map((t) => t.volume.toString())).toEqual(["90000", "180000", "270000"]);
  });

  it("material, conversion, overhead, packing and freight", () => {
    for (const t of tiers) {
      expect([f2(t.material), f2(t.conversion), f2(t.overhead), f2(t.packing), f2(t.freight)]).toEqual([
        "41.23", "45.33", "5.44", "1.50", "2.00",
      ]);
    }
  });

  it("amortises setup + tooling over each tier", () => {
    expect(tiers.map((t) => f2(t.setupTooling))).toEqual(["2.22", "1.11", "0.74"]);
  });

  it("total cost, markup and price per unit", () => {
    expect(tiers.map((t) => f2(t.totalCost))).toEqual(["97.72", "96.61", "96.24"]);
    expect(tiers.map((t) => f2(t.markup))).toEqual(["9.77", "9.66", "9.62"]);
    expect(tiers.map((t) => f2(t.pricePerUnit))).toEqual(["107.49", "106.27", "105.86"]);
  });

  it("GST is its own line at 18% and is not in the price", () => {
    expect(DEFAULT_GST_PERCENT).toBe("18");
    expect(tiers.map((t) => f2(t.gst))).toEqual(["19.35", "19.13", "19.05"]);
  });

  it("annual value excludes GST", () => {
    expect(tiers.map((t) => f2(t.annualValue))).toEqual(["9674100.00", "19128600.00", "28582200.00"]);
  });

  it("approval is judged on the pre-GST 1× annual value", () => {
    const quote = calculateQuoteCost(spindle);
    expect(f2(quote.baseAnnualValue)).toBe("19128600.00");
    expect(quote.requiresApproval).toBe(true);
  });

  it("unit price falls as volume rises", () => {
    const prices = tiers.map((t) => t.pricePerUnit.toNumber());
    expect(prices[0]).toBeGreaterThan(prices[1]!);
    expect(prices[1]).toBeGreaterThan(prices[2]!);
  });
});

describe("tier behaviour", () => {
  it("price is flat across tiers when there is no setup, tooling or freight difference", () => {
    const { tiers } = calculateQuoteCost({ ...spindle, setupCost: 0, toolingCost: 0 });
    expect(new Set(tiers.map((t) => f2(t.pricePerUnit))).size).toBe(1);
  });

  it("freight can differ per tier and only moves its own tier", () => {
    const base = calculateQuoteCost(spindle).tiers;
    const { tiers } = calculateQuoteCost({ ...spindle, freightPerUnit: [2, 2, 1.25] });
    expect(f2(tiers[2].freight)).toBe("1.25");
    expect(f2(tiers[2].totalCost)).toBe("95.49"); // 96.24 − 0.75
    expect(f2(tiers[0].pricePerUnit)).toBe(f2(base[0].pricePerUnit));
    expect(f2(tiers[1].pricePerUnit)).toBe(f2(base[1].pricePerUnit));
  });

  it("markup is on total cost including setup + tooling, not on price", () => {
    const { tiers } = calculateQuoteCost(spindle);
    expect(f2(tiers[0].markup)).toBe(f2(tiers[0].totalCost.times("0.10").toDecimalPlaces(2)));
    expect(tiers[0].pricePerUnit.eq(tiers[0].totalCost.plus(tiers[0].markup))).toBe(true);
  });

  it("zero markup prices at cost", () => {
    const { tiers } = calculateQuoteCost({ ...spindle, markupPercent: 0 });
    expect(tiers.every((t) => t.pricePerUnit.eq(t.totalCost) && t.markup.isZero())).toBe(true);
  });

  it("GST rate is configurable and zero is allowed", () => {
    expect(f2(calculateQuoteCost({ ...spindle, gstPercent: 12 }).tiers[1].gst)).toBe("12.75"); // 106.27 × 12%
    expect(f2(calculateQuoteCost({ ...spindle, gstPercent: 0 }).tiers[1].gst)).toBe("0.00");
  });

  it("printed rows always add up: total = sum of rounded parts, price = total + markup", () => {
    const awkward: QuoteCostInput = {
      ...spindle,
      annualVolume: 777,
      setupCost: 12345.67,
      toolingCost: 8910.11,
      overheadPercent: 13.7,
      markupPercent: 7.3,
      packingPerUnit: 0.333,
      freightPerUnit: [1.117, 0.884, 0.5],
    };
    for (const t of calculateQuoteCost(awkward).tiers) {
      const parts = t.material.plus(t.conversion).plus(t.setupTooling).plus(t.overhead).plus(t.packing).plus(t.freight);
      expect(t.totalCost.eq(parts)).toBe(true);
      expect(t.pricePerUnit.eq(t.totalCost.plus(t.markup))).toBe(true);
      expect(t.pricePerUnit.decimalPlaces()).toBeLessThanOrEqual(2);
    }
  });
});

describe("tierVolume", () => {
  it.each([
    ["180000", "0.5", "90000"],
    ["101", "0.5", "51"], // 50.5 rounds half-up
    ["101", "1.5", "152"], // 151.5 rounds half-up
    ["3", "0.5", "2"], // 1.5 → 2
    ["1", "0.5", "1"], // 0.5 → 1 (also the minimum)
    ["1", "1.5", "2"],
    ["1", "1", "1"],
  ])("%s × %s = %s pieces", (annual, factor, expected) => {
    expect(tierVolume(new D(annual), factor).toString()).toBe(expected);
  });

  it("never goes below one piece", () => {
    expect(tierVolume(new D(1), "0.5").gte(1)).toBe(true);
  });
});

describe("approval threshold through the full calculation", () => {
  // Price is exactly ₹100.00/unit: material 100.00, conversion rounds to 0.00, everything else zero.
  const at25Lakh: QuoteCostInput = {
    annualVolume: 25000,
    material: { grossWeightKg: 1, netWeightKg: 1, ratePerKg: 100, scrapRecoveryPerKg: 0 },
    routing: [{ cycleTimeMin: 0.6, hourRate: 0.01, efficiency: 1 }],
    setupCost: 0,
    toolingCost: 0,
    overheadPercent: 0,
    packingPerUnit: 0,
    freightPerUnit: [0, 0, 0],
    markupPercent: 0,
  };

  it("exactly ₹25,00,000 at 1× does not need approval, even though 1.5× is above it", () => {
    const quote = calculateQuoteCost(at25Lakh);
    expect(f2(quote.baseAnnualValue)).toBe("2500000.00");
    expect(f2(quote.tiers[2].annualValue)).toBe("3750000.00");
    expect(quote.requiresApproval).toBe(false);
  });

  it("one paisa per unit more tips 1× over the threshold", () => {
    const quote = calculateQuoteCost({ ...at25Lakh, material: { ...at25Lakh.material, ratePerKg: "100.01" } });
    expect(f2(quote.baseAnnualValue)).toBe("2500250.00");
    expect(quote.requiresApproval).toBe(true);
  });

  it("a high 1.5× tier alone never triggers approval; only the 1× value counts", () => {
    const quote = calculateQuoteCost({ ...at25Lakh, annualVolume: 20000 });
    expect(f2(quote.baseAnnualValue)).toBe("2000000.00");
    expect(f2(quote.tiers[2].annualValue)).toBe("3000000.00");
    expect(quote.requiresApproval).toBe(false);
  });
});

describe("scrap allowance in the material line", () => {
  const material = { grossWeightKg: 1, netWeightKg: 0.8, ratePerKg: 100, scrapRecoveryPerKg: 50 };
  const materialOf = (scrapPercent?: unknown) =>
    f2(calculateQuoteCost({ ...spindle, material: { ...material, scrapPercent: scrapPercent as number } }).tiers[1].material);

  it("blank or zero scrap % leaves the brief's formula unchanged", () => {
    expect(materialOf(undefined)).toBe("90.00"); // 100 − 0.2 × 50
    expect(materialOf(0)).toBe("90.00");
  });

  it("scrap % buys extra kg that is not credited back", () => {
    expect(materialOf(10)).toBe("100.00"); // 1.10 × 100 − 10
  });

  it("does not touch conversion, overhead or markup inputs", () => {
    const a = calculateQuoteCost({ ...spindle, material: { ...spindle.material, scrapPercent: 0 } }).tiers[1];
    const b = calculateQuoteCost(spindle).tiers[1];
    expect([f2(a.conversion), f2(a.overhead)]).toEqual([f2(b.conversion), f2(b.overhead)]);
  });
});

describe("invalid inputs are rejected, not guessed", () => {
  it.each([
    ["missing annual volume", { annualVolume: undefined }, "MISSING"],
    ["zero annual volume", { annualVolume: 0 }, "NOT_POSITIVE"],
    ["negative annual volume", { annualVolume: -5 }, "NOT_POSITIVE"],
    ["fractional annual volume", { annualVolume: 1000.5 }, "NOT_INTEGER"],
    ["negative setup cost", { setupCost: -1 }, "NEGATIVE"],
    ["missing tooling cost", { toolingCost: null }, "MISSING"],
    ["negative overhead %", { overheadPercent: -1 }, "NEGATIVE"],
    ["negative markup %", { markupPercent: -5 }, "NEGATIVE"],
    ["negative GST %", { gstPercent: -1 }, "NEGATIVE"],
    ["negative packing", { packingPerUnit: -0.5 }, "NEGATIVE"],
    ["negative freight on one tier", { freightPerUnit: [2, -1, 2] as const }, "NEGATIVE"],
    ["missing freight on one tier", { freightPerUnit: [2, undefined, 2] as const }, "MISSING"],
    ["non-numeric markup", { markupPercent: "ten" }, "NOT_A_NUMBER"],
    ["empty routing", { routing: [] }, "EMPTY_ROUTING"],
    ["net weight above gross", { material: { ...spindle.material, netWeightKg: 0.9 } }, "NET_EXCEEDS_GROSS"],
    ["scrap % above 50", { material: { ...spindle.material, scrapPercent: 51 } }, "PERCENT_RANGE"],
    ["overhead % above 100", { overheadPercent: 101 }, "PERCENT_RANGE"],
    ["markup % above 200", { markupPercent: 201 }, "PERCENT_RANGE"],
    ["GST % above 40", { gstPercent: 41 }, "PERCENT_RANGE"],
    ["negative scrap %", { material: { ...spindle.material, scrapPercent: -1 } }, "NEGATIVE"],
    ["zero material rate", { material: { ...spindle.material, ratePerKg: 0 } }, "NOT_POSITIVE"],
  ] as const)("%s", (_name, patch, code) => {
    expect(codeOf({ ...spindle, ...(patch as Partial<QuoteCostInput>) })).toBe(code);
  });
});

describe("default costing inputs sit inside the limits (F-22, F-23)", () => {
  it("accepts the shipped defaults and the exact limits", async () => {
    const { DEFAULT_COSTING_INPUTS } = await import("@/lib/costing/defaults");
    const d = DEFAULT_COSTING_INPUTS;
    expect(() => calculateQuoteCost({ ...spindle, material: { ...spindle.material, scrapPercent: d.scrapPercent }, markupPercent: d.markupPercent, gstPercent: d.gstPercent })).not.toThrow();
    expect(() => calculateQuoteCost({ ...spindle, material: { ...spindle.material, scrapPercent: 50 }, overheadPercent: 100, markupPercent: 200, gstPercent: 40 })).not.toThrow();
  });
});
