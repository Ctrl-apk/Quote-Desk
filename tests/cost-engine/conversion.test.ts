import { describe, expect, it } from "vitest";
import { CostInputError, conversionCostPerUnit } from "@/lib/cost-engine";

const op = (cycleTimeMin: unknown, hourRate: unknown, efficiency: unknown = 1) =>
  ({ cycleTimeMin, hourRate, efficiency }) as Parameters<typeof conversionCostPerUnit>[0][number];

describe("conversionCostPerUnit", () => {
  it("brief check: 3.2 min at ₹850/hr = ₹45.33 per piece", () => {
    expect(conversionCostPerUnit([op(3.2, 850)]).toFixed(2)).toBe("45.33");
  });

  it("matches the other sample RFQs", () => {
    expect(conversionCostPerUnit([op(11.5, 1450)]).toFixed(2)).toBe("277.92"); // 277.9166…
    expect(conversionCostPerUnit([op(4.8, 950)]).toFixed(2)).toBe("76.00");
  });

  it("divides by efficiency", () => {
    expect(conversionCostPerUnit([op(3.2, 850, 0.85)]).toFixed(2)).toBe("53.33"); // 45.333… ÷ 0.85
  });

  it("sums operations before rounding, not after", () => {
    // each op is 0.005 per piece (0.006 min at ₹50/hr ÷ 60 = 0.005); rounding each first would give 0.02, not 0.01
    const ops = [op("0.006", 50), op("0.006", 50)];
    expect(conversionCostPerUnit(ops).toFixed(2)).toBe("0.01");
  });

  it("accepts strings, as values arrive from the database", () => {
    expect(conversionCostPerUnit([op("3.200", "850.00", "1.0000")]).toFixed(2)).toBe("45.33");
  });

  it.each([
    ["empty routing", [], "EMPTY_ROUTING"],
    ["zero cycle time", [op(0, 850)], "NOT_POSITIVE"],
    ["negative cycle time", [op(-1, 850)], "NOT_POSITIVE"],
    ["zero hour rate", [op(3.2, 0)], "NOT_POSITIVE"],
    ["missing hour rate", [op(3.2, undefined)], "MISSING"],
    ["null cycle time", [op(null, 850)], "MISSING"],
    ["non-numeric cycle time", [op("abc", 850)], "NOT_A_NUMBER"],
    ["infinite hour rate", [op(3.2, Infinity)], "NOT_A_NUMBER"],
    ["zero efficiency", [op(3.2, 850, 0)], "NOT_POSITIVE"],
    ["efficiency above 1", [op(3.2, 850, 1.2)], "EFFICIENCY_RANGE"],
  ])("rejects %s", (_name, ops, code) => {
    expect(() => conversionCostPerUnit(ops)).toThrow(CostInputError);
    try {
      conversionCostPerUnit(ops);
    } catch (e) {
      expect((e as CostInputError).code).toBe(code);
    }
  });

  it("names the failing operation so the UI can point at the row", () => {
    try {
      conversionCostPerUnit([op(3.2, 850), op(0, 850)]);
      expect.unreachable();
    } catch (e) {
      expect((e as CostInputError).field).toBe("routing[1].cycleTimeMin");
    }
  });
});
