import { describe, expect, it } from "vitest";
import { MACHINE_RATES, MATERIAL_RATES, OVERHEAD_RATES } from "../../prisma/seed-data";
import { computeCosting, initialForm, serializeTiers, snapshotFor, type CostingForm, type RateTables } from "@/lib/costing/form";

const withIds = <T extends object>(rows: T[], prefix: string) => rows.map((r, i) => ({ ...r, id: `${prefix}-${i}` }));
const rates: RateTables = {
  materials: withIds(MATERIAL_RATES, "mat"),
  machines: withIds(MACHINE_RATES, "mac"),
  overhead: withIds(OVERHEAD_RATES, "oh"),
};

/** The rear wheel spindle, priced on the second rate versions (after 1 Oct 2026). */
const spindle: CostingForm = {
  quotedOn: "2026-11-03",
  materialCode: "EN8",
  grossWeightKg: "0.61",
  netWeightKg: "0.52",
  annualVolume: "180000",
  setupCost: "50000",
  toolingCost: "150000",
  routing: [{ operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "3.2" }],
  scrapPercent: "2",
  overheadPercent: "12",
  packingPerUnit: "1.50",
  freightPerUnit: ["2.00", "2.00", "2.00"],
  markupPercent: "10",
  gstPercent: "18",
};
const ok = (form: CostingForm) => {
  const r = computeCosting(form, rates);
  if (!r.ok) throw new Error(`expected ok, got: ${r.message}`);
  return r;
};

describe("computeCosting", () => {
  it("prices the spindle from dated rates", () => {
    const r = ok(spindle);
    const t = r.cost.tiers[1];
    // material: 0.61 × 1.02 × 76 − 0.09 × 27 = 47.2872 − 2.43 = 44.86; conversion 45.33 (₹850, efficiency 1)
    expect(t.material.toFixed(2)).toBe("44.86");
    expect(t.conversion.toFixed(2)).toBe("45.33");
    expect(t.overhead.toFixed(2)).toBe("5.44"); // 12% of 45.33
    expect(t.setupTooling.toFixed(2)).toBe("1.11");
    expect(t.totalCost.toFixed(2)).toBe("100.24"); // 44.86 + 45.33 + 1.11 + 5.44 + 1.50 + 2.00
    expect(t.markup.toFixed(2)).toBe("10.02");
    expect(t.pricePerUnit.toFixed(2)).toBe("110.26");
    expect(t.annualValue.toFixed(2)).toBe("19846800.00");
    expect(r.cost.requiresApproval).toBe(true);
  });

  it("the quote date decides which rate version is used", () => {
    const before = ok({ ...spindle, quotedOn: "2026-09-30", overheadPercent: "11" });
    const after = ok({ ...spindle, quotedOn: "2026-10-01" });
    expect(before.materialRate.ratePerKg).toBe("70.0000");
    expect(after.materialRate.ratePerKg).toBe("76.0000");
    expect(before.cost.tiers[1].material.lt(after.cost.tiers[1].material)).toBe(true);
    expect(before.overheadMaster.percent).toBe("11.000");
  });

  it("flags an overhead % that differs from the master", () => {
    expect(ok(spindle).overheadOverridden).toBe(false);
    expect(ok({ ...spindle, overheadPercent: "15" }).overheadOverridden).toBe(true);
    expect(ok({ ...spindle, overheadPercent: "12.0" }).overheadOverridden).toBe(false);
  });

  it("shows per-operation cost without changing the engine's conversion total", () => {
    const r = ok({
      ...spindle,
      routing: [
        { operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "3.2" },
        { operation: "Drilling", machineCode: "DRL-1", cycleTimeMin: "0.8" },
      ],
    });
    expect(r.routingLines.map((l) => l.costPerPiece.toFixed(2))).toEqual(["45.33", "5.93"]); // 0.8/60 × 400 / 0.9
    expect(r.cost.tiers[0].conversion.toFixed(2)).toBe("51.26"); // 45.333… + 5.925… rounded once
    expect(r.routingLines[1]!.hourRate).toBe("400.00");
  });

  it("an efficient machine rate changes conversion", () => {
    const r = ok({ ...spindle, routing: [{ operation: "Turning", machineCode: "CNC-T3", cycleTimeMin: "2.1" }] });
    expect(r.machineRates[0]!.hourRate).toBe("740.00"); // second version
    expect(r.cost.tiers[1].conversion.toFixed(2)).toBe("30.47"); // 2.1/60 × 740 / 0.85
  });

  it.each([
    ["unknown material", { materialCode: "XYZ" }, /No material rate exists for XYZ/],
    ["quote date before the first rate", { quotedOn: "2026-03-01" }, /on or before 2026-03-01.*starts 2026-04-01/],
    ["unknown machine", { routing: [{ operation: "Turning", machineCode: "NOPE", cycleTimeMin: "3" }] }, /No machine rate exists for NOPE/],
    ["invalid date", { quotedOn: "03/11/2026" }, /not a valid date/],
    ["net above gross", { netWeightKg: "0.9" }, /Net weight cannot exceed gross/],
    ["blank gross weight", { grossWeightKg: "" }, /grossWeightKg is required/],
    ["blank overhead", { overheadPercent: "" }, /overheadPercent is required/],
    ["zero volume", { annualVolume: "0" }, /annualVolume must be greater than zero/],
    ["zero cycle time", { routing: [{ operation: "T", machineCode: "CNC-T1", cycleTimeMin: "0" }] }, /cycleTimeMin must be greater than zero/],
    ["blank cycle time", { routing: [{ operation: "T", machineCode: "CNC-T1", cycleTimeMin: "" }] }, /cycleTimeMin is required/],
    ["negative packing", { packingPerUnit: "-1" }, /packingPerUnit cannot be negative/],
  ] as const)("returns a message, not a crash, for %s", (_name, patch, message) => {
    const r = computeCosting({ ...spindle, ...(patch as Partial<CostingForm>) }, rates);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.message).toMatch(message);
  });

  it("names the field when the engine can", () => {
    const r = computeCosting({ ...spindle, grossWeightKg: "" }, rates);
    expect(r.ok ? "" : r.field).toBe("grossWeightKg");
  });
});

describe("snapshotFor and serializeTiers", () => {
  it("records the exact rate rows used, and nothing else", () => {
    const r = ok({
      ...spindle,
      routing: [
        { operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "3.2" },
        { operation: "Drilling", machineCode: "DRL-1", cycleTimeMin: "0.8" },
      ],
    });
    const { rateRowIds, ratesSnapshot } = snapshotFor(r, spindle.quotedOn);
    expect(rateRowIds.materials).toHaveLength(1);
    expect(rateRowIds.machines).toHaveLength(2);
    expect(rateRowIds.overhead).toHaveLength(1);
    expect(ratesSnapshot.materials[0]).toMatchObject({ materialCode: "EN8", ratePerKg: "76.0000", effectiveFrom: "2026-10-01" });
    expect(ratesSnapshot.quotedOn).toBe("2026-11-03");
  });

  it("serialises tiers as strings that survive JSON unchanged", () => {
    const tiers = serializeTiers(ok(spindle).cost);
    expect(JSON.parse(JSON.stringify(tiers))).toEqual(tiers);
    expect(tiers[1]).toMatchObject({ volume: "180000", pricePerUnit: "110.26", annualValue: "19846800.00" });
    expect(tiers.map((t) => t.factor)).toEqual(["0.5", "1", "1.5"]);
  });
});

describe("initialForm", () => {
  const part = { materialCode: "EN8", grossWeightKg: "0.6100", netWeightKg: "0.5200", annualVolume: 180000, setupCost: "50000.00", toolingCost: "150000.00", routing: spindle.routing };

  it("uses part values, defaults, and the overhead master at today's date", () => {
    const f = initialForm(part, null, rates, "2026-11-03");
    expect(f).toMatchObject({ quotedOn: "2026-11-03", materialCode: "EN8", annualVolume: "180000", overheadPercent: "12", scrapPercent: "2", markupPercent: "10", gstPercent: "18" });
    expect(f.freightPerUnit).toEqual(["2.00", "2.00", "2.00"]);
  });

  it("takes the older overhead master for an older date", () => {
    expect(initialForm(part, null, rates, "2026-06-01").overheadPercent).toBe("11");
  });

  it("prefers a saved quote's inputs, including its date", () => {
    const f = initialForm(part, { ...spindle, quotedOn: "2026-09-01", markupPercent: "8" }, rates, "2026-11-03");
    expect(f.quotedOn).toBe("2026-09-01");
    expect(f.markupPercent).toBe("8");
  });

  it("starts empty-safe when the part has no values yet", () => {
    const f = initialForm({ ...part, materialCode: null, grossWeightKg: null, netWeightKg: null, annualVolume: null, routing: [] }, null, rates, "2026-11-03");
    expect(f).toMatchObject({ materialCode: "", grossWeightKg: "", annualVolume: "" });
    expect(f.routing).toEqual([{ operation: "", machineCode: "", cycleTimeMin: "" }]);
    expect(computeCosting(f, rates).ok).toBe(false);
  });
});
