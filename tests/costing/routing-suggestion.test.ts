import { describe, expect, it } from "vitest";
import { stepsToFormRows } from "@/lib/costing/routing-suggestion";
import { suggestRoutingSchema } from "@/lib/costing/schemas";

describe("stepsToFormRows", () => {
  const steps = [
    { operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "3.2" },
    { operation: "Honing", machineCode: "HON-9", cycleTimeMin: "1.1" },
  ];
  it("keeps steps whose machine has a rate", () => {
    expect(stepsToFormRows(steps.slice(0, 1), ["CNC-T1"]).rows).toEqual(steps.slice(0, 1));
  });
  it("blanks a machine with no current rate instead of guessing, and reports it", () => {
    const r = stepsToFormRows(steps, ["CNC-T1"]);
    expect(r.rows[1]).toEqual({ operation: "Honing", machineCode: "", cycleTimeMin: "1.1" });
    expect(r.unknownMachines).toEqual(["HON-9"]);
  });
  it("does not change the cycle time it was given", () => expect(stepsToFormRows(steps, []).rows.map((s) => s.cycleTimeMin)).toEqual(["3.2", "1.1"]));
});

describe("suggestRoutingSchema", () => {
  it("needs a material and a positive weight", () => {
    expect(suggestRoutingSchema.safeParse({ materialCode: "EN8", grossWeightKg: "0.61" }).success).toBe(true);
    for (const bad of [{ materialCode: "", grossWeightKg: "1" }, { materialCode: "EN8", grossWeightKg: "0" }, { materialCode: "EN8", grossWeightKg: "-1" }, { materialCode: "EN8", grossWeightKg: "NaN" }, { materialCode: "EN8", grossWeightKg: "1e9" }]) {
      expect(suggestRoutingSchema.safeParse(bad).success).toBe(false);
    }
  });
});
