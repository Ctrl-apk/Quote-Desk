import { describe, expect, it } from "vitest";
import { buildRatesSnapshot, lookupMaterialRate } from "@/lib/rates";
import type { MachineRateRow, MaterialRateRow, OverheadRateRow } from "@/lib/rates";

const machine: MachineRateRow = { id: "c1", machineCode: "CNC-1", hourRate: "850", efficiency: "0.85", effectiveFrom: "2026-04-01" };
const overhead: OverheadRateRow = { id: "o1", category: "STANDARD", percent: "12", effectiveFrom: "2026-04-01" };

describe("buildRatesSnapshot", () => {
  it("a saved quote keeps its old rates after a new rate is added", () => {
    const table: MaterialRateRow[] = [
      { id: "m-apr", materialCode: "EN8", ratePerKg: "70", scrapRecoveryPerKg: "25", effectiveFrom: "2026-04-01" },
    ];

    // Quote saved in June against the April rate.
    const quotedOn = "2026-06-15";
    const used = lookupMaterialRate(table, "EN8", quotedOn);
    const saved = JSON.parse(JSON.stringify(buildRatesSnapshot({ materials: [used], machines: [machine], overhead: [overhead] }, quotedOn)));

    // Later, a new rate is appended and even the old row object is tampered with in memory.
    table.push({ id: "m-oct", materialCode: "EN8", ratePerKg: "76", scrapRecoveryPerKg: "30", effectiveFrom: "2026-10-01" });
    used.ratePerKg = "999";

    expect(saved.rateRowIds.materials).toEqual(["m-apr"]);
    expect(saved.ratesSnapshot.materials[0].ratePerKg).toBe("70");
    expect(saved.ratesSnapshot.quotedOn).toBe("2026-06-15");

    // New quotes see the new rate; re-pricing the old date still resolves to the old row.
    expect(lookupMaterialRate(table, "EN8", "2026-11-02").id).toBe("m-oct");
    expect(lookupMaterialRate(table, "EN8", "2026-06-15").id).toBe("m-apr");
  });

  it("records ids for every rate family and de-duplicates repeats", () => {
    const m: MaterialRateRow = { id: "m1", materialCode: "EN8", ratePerKg: "70", scrapRecoveryPerKg: "25", effectiveFrom: "2026-04-01" };
    const { rateRowIds, ratesSnapshot } = buildRatesSnapshot(
      { materials: [m, m], machines: [machine, machine], overhead: [overhead] },
      "2026-11-02",
    );
    expect(rateRowIds).toEqual({ materials: ["m1"], machines: ["c1"], overhead: ["o1"] });
    expect(ratesSnapshot.machines).toHaveLength(1);
  });

  it("stores values as strings that survive a JSON round trip unchanged", () => {
    const { ratesSnapshot } = buildRatesSnapshot({ materials: [], machines: [machine], overhead: [overhead] }, "2026-11-02");
    expect(JSON.parse(JSON.stringify(ratesSnapshot))).toEqual(ratesSnapshot);
    expect(typeof ratesSnapshot.machines[0]?.hourRate).toBe("string");
  });
});
