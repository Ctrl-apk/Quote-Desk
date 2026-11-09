import { describe, expect, it } from "vitest";
import { CostInputError, materialCostPerUnit } from "@/lib/cost-engine";

const base = { grossWeightKg: 0.61, netWeightKg: 0.5, ratePerKg: 70, scrapRecoveryPerKg: 25 };
const codeOf = (input: Parameters<typeof materialCostPerUnit>[0]) => {
  try {
    materialCostPerUnit(input);
  } catch (e) {
    return (e as CostInputError).code;
  }
  return "NO_ERROR";
};

describe("materialCostPerUnit", () => {
  it("gross × rate − (gross − net) × recovery", () => {
    // 0.61 × 70 = 42.70; scrap 0.11 kg × 25 = 2.75; 42.70 − 2.75 = 39.95
    expect(materialCostPerUnit(base).toFixed(2)).toBe("39.95");
  });

  it("net equal to gross means no scrap credit", () => {
    expect(materialCostPerUnit({ ...base, netWeightKg: 0.61 }).toFixed(2)).toBe("42.70");
  });

  it("zero scrap recovery rate is allowed", () => {
    expect(materialCostPerUnit({ ...base, scrapRecoveryPerKg: 0 }).toFixed(2)).toBe("42.70");
  });

  it("rounds half-up at paise with exact decimals (floats would give 1.00)", () => {
    const input = { grossWeightKg: "1.005", netWeightKg: "1.005", ratePerKg: 1, scrapRecoveryPerKg: 0 };
    expect(materialCostPerUnit(input).toFixed(2)).toBe("1.01");
  });

  it("rejects net weight above gross", () => {
    expect(codeOf({ ...base, netWeightKg: 0.7 })).toBe("NET_EXCEEDS_GROSS");
  });

  it.each([
    ["missing gross", { ...base, grossWeightKg: undefined }, "MISSING"],
    ["missing net", { ...base, netWeightKg: null }, "MISSING"],
    ["zero gross", { ...base, grossWeightKg: 0 }, "NOT_POSITIVE"],
    ["negative net", { ...base, netWeightKg: -0.1 }, "NOT_POSITIVE"],
    ["zero material rate", { ...base, ratePerKg: 0 }, "NOT_POSITIVE"],
    ["negative recovery", { ...base, scrapRecoveryPerKg: -1 }, "NEGATIVE"],
    ["non-numeric rate", { ...base, ratePerKg: "n/a" }, "NOT_A_NUMBER"],
  ])("rejects %s", (_name, input, code) => {
    expect(codeOf(input)).toBe(code);
  });
});

describe("materialCostPerUnit scrap allowance", () => {
  it("adds scrap % to the kilograms bought, without a recovery credit on the allowance", () => {
    // 0.61 × 1.03 × 70 = 43.981; recovery 0.11 × 25 = 2.75; 43.981 − 2.75 = 41.231
    expect(materialCostPerUnit({ ...base, scrapPercent: 3 }).toFixed(2)).toBe("41.23");
    expect(materialCostPerUnit({ grossWeightKg: 1, netWeightKg: 1, ratePerKg: 100, scrapRecoveryPerKg: 50, scrapPercent: 10 }).toFixed(2)).toBe("110.00");
  });

  it("treats blank scrap % as zero", () => {
    expect(materialCostPerUnit({ ...base, scrapPercent: null }).toFixed(2)).toBe("39.95");
    expect(materialCostPerUnit({ ...base, scrapPercent: "" }).toFixed(2)).toBe("39.95");
  });

  it("rejects scrap % below 0 or above the 50% limit (F-23)", () => {
    expect(codeOf({ ...base, scrapPercent: -1 })).toBe("NEGATIVE");
    expect(codeOf({ ...base, scrapPercent: 50.01 })).toBe("PERCENT_RANGE");
    expect(codeOf({ ...base, scrapPercent: 50 })).toBe("NO_ERROR");
  });
});
