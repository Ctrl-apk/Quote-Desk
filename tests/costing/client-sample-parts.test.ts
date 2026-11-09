import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { MACHINE_RATES, MATERIAL_RATES, OVERHEAD_RATES } from "../../prisma/seed-data";
import { computeCosting, type CostingForm, type RateTables } from "@/lib/costing/form";

/**
 * Acceptance test on the client's three sample parts. Cycle time, hour rate, gross weight and volume are
 * GIVEN by the client; net weight, setup, tooling, scrap, overhead %, packing, freight, markup and GST are
 * the seed's labelled ILLUSTRATIVE values (docs/assumptions.md). The expected numbers below are worked out
 * here with plain decimal.js arithmetic from those inputs, separately from the engine, so a mistake in the
 * engine cannot hide behind itself.
 */
const withIds = <T extends object>(rows: T[], p: string) => rows.map((r, i) => ({ ...r, id: `${p}-${i}` }));
const rates: RateTables = { materials: withIds(MATERIAL_RATES, "m"), machines: withIds(MACHINE_RATES, "c"), overhead: withIds(OVERHEAD_RATES, "o") };

const r2 = (x: Decimal.Value) => new Decimal(x).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const wholePieces = (x: Decimal) => Decimal.max(1, x.toDecimalPlaces(0, Decimal.ROUND_HALF_UP));

interface Case { rfq: string; name: string; material: string; machine: string; gross: string; net: string; volume: number; minutes: string; hourRate: string; ratePerKg: string; recovery: string; setup: string; tooling: string; approval: boolean }
const CASES: Case[] = [
  { rfq: "RFQ-2611-014", name: "Rear wheel spindle", material: "EN8", machine: "CNC-T1", gross: "0.61", net: "0.52", volume: 180000, minutes: "3.2", hourRate: "850", ratePerKg: "76", recovery: "27", setup: "50000", tooling: "150000", approval: true },
  { rfq: "RFQ-2611-019", name: "Hydraulic lift arm", material: "40Cr4", machine: "VMC-1", gross: "4.6", net: "3.9", volume: 24000, minutes: "11.5", hourRate: "1450", ratePerKg: "84", recovery: "26", setup: "120000", tooling: "450000", approval: true },
  { rfq: "RFQ-2611-023", name: "Gear blank", material: "20MnCr5", machine: "CNC-T2", gross: "1.48", net: "1.2", volume: 60000, minutes: "4.8", hourRate: "950", ratePerKg: "78", recovery: "26", setup: "80000", tooling: "200000", approval: true },
];
const SCRAP = "2", OVERHEAD = "12", PACKING = "1.50", FREIGHT = ["2.00", "2.50", "3.00"], MARKUP = "10", GST = "18";

function expected(c: Case) {
  const material = r2(new Decimal(c.gross).times(1 + Number(SCRAP) / 100).times(c.ratePerKg).minus(new Decimal(c.gross).minus(c.net).times(c.recovery)));
  const conversion = r2(new Decimal(c.minutes).div(60).times(c.hourRate));
  const overhead = r2(conversion.times(OVERHEAD).div(100));
  return [0.5, 1, 1.5].map((f, i) => {
    const volume = wholePieces(new Decimal(c.volume).times(f));
    const setupTooling = r2(new Decimal(c.setup).plus(c.tooling).div(volume));
    const total = material.plus(conversion).plus(overhead).plus(setupTooling).plus(PACKING).plus(FREIGHT[i]!);
    const markup = r2(total.times(MARKUP).div(100));
    const price = total.plus(markup);
    return { volume: volume.toNumber(), material, conversion, overhead, setupTooling, total, markup, price, gst: r2(price.times(GST).div(100)), annual: price.times(volume) };
  });
}

const formFor = (c: Case): CostingForm => ({
  quotedOn: "2026-11-03", materialCode: c.material, grossWeightKg: c.gross, netWeightKg: c.net, annualVolume: String(c.volume),
  setupCost: c.setup, toolingCost: c.tooling, routing: [{ operation: "Machining", machineCode: c.machine, cycleTimeMin: c.minutes }],
  scrapPercent: SCRAP, overheadPercent: OVERHEAD, packingPerUnit: PACKING, freightPerUnit: [FREIGHT[0]!, FREIGHT[1]!, FREIGHT[2]!], markupPercent: MARKUP, gstPercent: GST,
});

describe.each(CASES)("$rfq $name", (c) => {
  const result = computeCosting(formFor(c), rates);
  if (!result.ok) throw new Error(result.message);
  const want = expected(c);

  it.each([0, 1, 2])("tier %i matches independent arithmetic, line by line", (i) => {
    const got = result.cost.tiers[i as 0 | 1 | 2];
    const w = want[i]!;
    expect(got.volume.toNumber()).toBe(w.volume);
    expect(got.material.toFixed(2)).toBe(w.material.toFixed(2));
    expect(got.conversion.toFixed(2)).toBe(w.conversion.toFixed(2));
    expect(got.overhead.toFixed(2)).toBe(w.overhead.toFixed(2));
    expect(got.setupTooling.toFixed(2)).toBe(w.setupTooling.toFixed(2));
    expect(got.totalCost.toFixed(2)).toBe(w.total.toFixed(2));
    expect(got.markup.toFixed(2)).toBe(w.markup.toFixed(2));
    expect(got.pricePerUnit.toFixed(2)).toBe(w.price.toFixed(2));
    expect(got.gst.toFixed(2)).toBe(w.gst.toFixed(2));
    expect(got.annualValue.toFixed(2)).toBe(w.annual.toFixed(2));
  });

  it("recalculates by volume: setup amortisation falls and freight follows its own input per tier, while material stays fixed", () => {
    const [a, b, d] = result.cost.tiers;
    expect(a.setupTooling.gt(b.setupTooling) && b.setupTooling.gt(d.setupTooling)).toBe(true);
    expect([a.freight, b.freight, d.freight].map((x) => x.toFixed(2))).toEqual(["2.00", "2.50", "3.00"]);
    expect(a.material.eq(b.material) && b.material.eq(d.material)).toBe(true);
  });

  it("judges approval on the pre-GST 1x annual value", () => {
    const base = want[1]!.annual;
    expect(result.cost.baseAnnualValue.toFixed(2)).toBe(base.toFixed(2));
    expect(result.cost.requiresApproval).toBe(base.gt(2_500_000));
    expect(result.cost.requiresApproval).toBe(c.approval);
  });
});

describe("conversion formula from the brief", () => {
  it("(cycle minutes / 60) x hour rate: spindle = 45.33", () => {
    const r = computeCosting(formFor(CASES[0]!), rates);
    if (!r.ok) throw new Error(r.message);
    expect(r.cost.tiers[1].conversion.toFixed(2)).toBe("45.33");
  });
});
