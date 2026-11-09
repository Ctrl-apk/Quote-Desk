import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO_CUSTOMERS, DEMO_RFQS, DEMO_USERS, MACHINE_RATES, MALFORMED_CSV_ROWS, MATERIAL_RATES, OVERHEAD_RATES,
  PAST_QUOTES, PAST_QUOTE_CSV_HEADER, isAiFilled, pastQuoteKey, pastQuotesCsv, rfqDueDate,
} from "../../prisma/seed-data";
import { APPROVAL_THRESHOLD_INR, calculateQuoteCost, conversionCostPerUnit } from "@/lib/cost-engine";
import { todayIst } from "@/lib/format/dates";
import { lookupMachineRate, lookupMaterialRate, lookupOverheadRate } from "@/lib/rates";
import { isOverdue } from "@/lib/rfq/overdue";

const today = todayIst();
const withIds = <T extends object>(rows: T[]) => rows.map((r, i) => ({ ...r, id: `row-${i}` }));
const materialRows = withIds(MATERIAL_RATES);
const machineRows = withIds(MACHINE_RATES);
const overheadRows = withIds(OVERHEAD_RATES);
const rfq = (no: string) => DEMO_RFQS.find((r) => r.rfqNo === no)!;

/** Quote inputs are not seeded (the costing screen supplies them). These stand in for the test only. */
function priceAnnualValue(no: string, onDate = today) {
  const { part } = rfq(no);
  const mat = lookupMaterialRate(materialRows, part.materialCode, onDate);
  const ops = part.routing.map((step) => {
    const m = lookupMachineRate(machineRows, step.machineCode, onDate);
    return { cycleTimeMin: step.cycleTimeMin, hourRate: m.hourRate, efficiency: m.efficiency };
  });
  return calculateQuoteCost({
    annualVolume: part.annualVolume,
    material: { grossWeightKg: part.grossWeightKg, netWeightKg: part.netWeightKg, ratePerKg: mat.ratePerKg, scrapRecoveryPerKg: mat.scrapRecoveryPerKg, scrapPercent: 2 },
    routing: ops,
    setupCost: part.setupCost,
    toolingCost: part.toolingCost,
    overheadPercent: lookupOverheadRate(overheadRows, "STANDARD", onDate).percent,
    packingPerUnit: 1.5,
    freightPerUnit: [2, 2, 2],
    markupPercent: 10,
  });
}

describe("users", () => {
  it("has one estimator and one sales_head with fake .example emails", () => {
    expect(DEMO_USERS.map((u) => u.role).sort()).toEqual(["estimator", "sales_head"]);
    for (const u of DEMO_USERS) {
      expect(u.email).toMatch(/@quotedesk\.example$/);
      expect(u.password.length).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("the three sample RFQs carry the brief's values", () => {
  it.each([
    ["RFQ-2611-014", "Company B", "Rear wheel spindle", "EN8", 0.61, 180000, 3.2, 850],
    ["RFQ-2611-019", "Company C", "Hydraulic lift arm", "40Cr4", 4.6, 24000, 11.5, 1450],
    ["RFQ-2611-023", "Company D", "Gear blank", "20MnCr5", 1.48, 60000, 4.8, 950],
  ])("%s", (no, customer, part, material, gross, volume, cycle, hourRate) => {
    const r = rfq(no);
    expect(r.customer).toBe(customer);
    expect(r.part.name).toBe(part);
    expect(r.part.materialCode).toBe(material);
    expect(Number(r.part.grossWeightKg)).toBe(gross);
    expect(r.part.annualVolume).toBe(volume);
    expect(Number(r.part.routing[0]!.cycleTimeMin)).toBe(cycle);
    expect(Number(lookupMachineRate(machineRows, r.part.routing[0]!.machineCode, today).hourRate)).toBe(hourRate);
  });

  it("the brief's check reproduces from seeded rates: 3.2 min at 850/hr = 45.33", () => {
    const m = lookupMachineRate(machineRows, "CNC-T1", today);
    expect(conversionCostPerUnit([{ cycleTimeMin: "3.2", hourRate: m.hourRate, efficiency: m.efficiency }]).toFixed(2)).toBe("45.33");
  });
});

describe("both approval paths can be demonstrated", () => {
  it("the three sample RFQs need approval", () => {
    for (const no of ["RFQ-2611-014", "RFQ-2611-019", "RFQ-2611-023"]) {
      expect(priceAnnualValue(no).requiresApproval, no).toBe(true);
    }
  });
  it("the small RFQ stays under ₹25 lakh with a wide margin", () => {
    const q = priceAnnualValue("RFQ-2611-027");
    expect(q.requiresApproval).toBe(false);
    expect(q.baseAnnualValue.lt(Number(APPROVAL_THRESHOLD_INR) / 2)).toBe(true);
  });
});

describe("RFQ register states", () => {
  it("has every status, unique numbers, and known customers", () => {
    expect(new Set(DEMO_RFQS.map((r) => r.status))).toEqual(new Set(["estimating", "sent", "won", "lost"]));
    expect(new Set(DEMO_RFQS.map((r) => r.rfqNo)).size).toBe(DEMO_RFQS.length);
    for (const r of DEMO_RFQS) expect(DEMO_CUSTOMERS).toContain(r.customer);
  });
  it("a lost RFQ has a reason and no other RFQ does", () => {
    for (const r of DEMO_RFQS) {
      if (r.status === "lost") expect(r.lostReason?.trim().length).toBeGreaterThan(0);
      else expect(r.lostReason).toBeUndefined();
    }
  });
  it("exactly one RFQ is overdue, and it is the lift arm", () => {
    const overdue = DEMO_RFQS.filter((r) => isOverdue(r.status, rfqDueDate(r, today), today));
    expect(overdue.map((r) => r.rfqNo)).toEqual(["RFQ-2611-019"]);
  });
  it("a sent RFQ can be past due without being overdue", () => {
    const sent = rfq("RFQ-2610-031");
    expect(rfqDueDate(sent, today) < today).toBe(true);
    expect(isOverdue(sent.status, rfqDueDate(sent, today), today)).toBe(false);
  });
});

describe("provenance and the accept gate", () => {
  it("manual values are accepted; at least one AI-filled value is left unaccepted to demo the gate", () => {
    const all = DEMO_RFQS.flatMap((r) => Object.values(r.part.fields));
    for (const f of all) if (!isAiFilled(f.source)) expect(f.accepted).toBe(true);
    expect(all.some((f) => isAiFilled(f.source) && !f.accepted)).toBe(true);
  });
  it("only the overdue lift arm has unaccepted values, so other sample RFQs are submittable", () => {
    const withGaps = DEMO_RFQS.filter((r) => Object.values(r.part.fields).some((f) => !f.accepted));
    expect(withGaps.map((r) => r.rfqNo)).toEqual(["RFQ-2611-019"]);
  });
  it("every source type appears", () => {
    const sources = new Set(DEMO_RFQS.flatMap((r) => Object.values(r.part.fields).map((f) => f.source)));
    expect(sources).toEqual(new Set(["email", "excel", "title_block", "manual"]));
  });
});

describe("net weight never exceeds gross", () => {
  it.each(DEMO_RFQS.map((r) => [r.rfqNo, r] as const))("%s", (_no, r) => {
    expect(Number(r.part.netWeightKg)).toBeLessThanOrEqual(Number(r.part.grossWeightKg));
  });
});

describe("rate masters show effective dating", () => {
  it("EN8 material, CNC-T3 machine and overhead each have two versions", () => {
    expect(MATERIAL_RATES.filter((r) => r.materialCode === "EN8")).toHaveLength(2);
    expect(MACHINE_RATES.filter((r) => r.machineCode === "CNC-T3")).toHaveLength(2);
    expect(OVERHEAD_RATES).toHaveLength(2);
  });
  it("lookup switches version on the effective date", () => {
    expect(lookupMaterialRate(materialRows, "EN8", "2026-09-30").ratePerKg).toBe("70.0000");
    expect(lookupMaterialRate(materialRows, "EN8", "2026-10-01").ratePerKg).toBe("76.0000");
    expect(lookupOverheadRate(overheadRows, "STANDARD", "2026-06-01").percent).toBe("11.000");
  });
  it("no two rows share a code and date", () => {
    const keys = [...MATERIAL_RATES.map((r) => `m|${r.materialCode}|${r.effectiveFrom}`), ...MACHINE_RATES.map((r) => `k|${r.machineCode}|${r.effectiveFrom}`), ...OVERHEAD_RATES.map((r) => `o|${r.category}|${r.effectiveFrom}`)];
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("every material and machine used by RFQs and past quotes has a rate today", () => {
    const steps = [...DEMO_RFQS.flatMap((r) => r.part.routing), ...PAST_QUOTES.flatMap((q) => q.routing)];
    for (const s of steps) expect(() => lookupMachineRate(machineRows, s.machineCode, today), s.machineCode).not.toThrow();
    for (const m of [...DEMO_RFQS.map((r) => r.part.materialCode), ...PAST_QUOTES.map((q) => q.materialCode)]) {
      expect(() => lookupMaterialRate(materialRows, m, today), m).not.toThrow();
    }
  });
  it("efficiencies are in (0, 1] and hour rates positive", () => {
    for (const m of MACHINE_RATES) {
      expect(Number(m.efficiency)).toBeGreaterThan(0);
      expect(Number(m.efficiency)).toBeLessThanOrEqual(1);
      expect(Number(m.hourRate)).toBeGreaterThan(0);
    }
  });
});

describe("past quotes and the import demo file", () => {
  const csvPath = path.resolve(__dirname, "../../prisma/demo/past-quotes-demo.csv");
  const csv = readFileSync(csvPath, "utf8");
  const dataLines = csv.trim().split("\n").slice(1);

  it("has 30 to 50 rows in the demo file, with a few deliberately malformed", () => {
    expect(dataLines.length).toBeGreaterThanOrEqual(30);
    expect(dataLines.length).toBeLessThanOrEqual(50);
    expect(MALFORMED_CSV_ROWS.length).toBeGreaterThanOrEqual(3);
    expect(dataLines.length).toBe(PAST_QUOTES.length + MALFORMED_CSV_ROWS.length);
  });
  it("the committed CSV matches the generator (run `npm run demo:csv` if this fails)", () => {
    expect(csv).toBe(pastQuotesCsv());
    expect(csv.startsWith(`${PAST_QUOTE_CSV_HEADER}\n`)).toBe(true);
  });
  it("every broken row is in the file and every row has 8 columns", () => {
    for (const bad of MALFORMED_CSV_ROWS) expect(dataLines).toContain(bad.line);
    for (const line of dataLines) expect(line.split(",")).toHaveLength(8);
  });
  it("valid rows have unique import keys and quote refs", () => {
    expect(new Set(PAST_QUOTES.map(pastQuoteKey)).size).toBe(PAST_QUOTES.length);
    expect(new Set(PAST_QUOTES.map((q) => q.quoteRef)).size).toBe(PAST_QUOTES.length);
  });
  it("valid rows are sane: positive weights and prices, real dates, at least one routing step", () => {
    for (const q of PAST_QUOTES) {
      expect(Number(q.grossWeightKg)).toBeGreaterThan(0);
      expect(Number(q.pricePerUnit)).toBeGreaterThan(0);
      expect(q.routing.length).toBeGreaterThan(0);
      expect(new Date(`${q.quotedOn}T00:00:00Z`).toISOString().startsWith(q.quotedOn)).toBe(true);
    }
  });
  it("routing suggestions have material to work with: each sample part has at least 3 similar past parts", () => {
    for (const no of ["RFQ-2611-014", "RFQ-2611-019", "RFQ-2611-023"]) {
      const { part } = rfq(no);
      const g = Number(part.grossWeightKg);
      const similar = PAST_QUOTES.filter((q) => q.materialCode === part.materialCode && Math.abs(Number(q.grossWeightKg) - g) / g <= 0.25);
      expect(similar.length, no).toBeGreaterThanOrEqual(3);
    }
  });
});
