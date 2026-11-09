import { describe, expect, it } from "vitest";
import { acceptFieldSchema, costingFormSchema, savePayloadSchema, updatePartFieldSchema } from "@/lib/costing/schemas";

const valid = {
  quotedOn: "2026-11-03", materialCode: "EN8", grossWeightKg: "0.61", netWeightKg: "0.52", annualVolume: "180000",
  setupCost: "50000", toolingCost: "150000",
  routing: [{ operation: "Turning", machineCode: "CNC-T1", cycleTimeMin: "3.2" }],
  scrapPercent: "2", overheadPercent: "12", packingPerUnit: "1.50", freightPerUnit: ["2.00", "2.00", "2.00"],
  markupPercent: "10", gstPercent: "18",
};

describe("costingFormSchema", () => {
  it("accepts a complete form", () => {
    expect(costingFormSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["scientific notation", { grossWeightKg: "1e5" }],
    ["negative number", { packingPerUnit: "-1" }],
    ["thousands separator", { setupCost: "1,000" }],
    ["blank number", { markupPercent: "" }],
    ["text", { scrapPercent: "abc" }],
    ["too many digits", { setupCost: "1234567890123" }],
    ["fractional volume", { annualVolume: "10.5" }],
    ["bad date", { quotedOn: "3 Nov 2026" }],
    ["blank material", { materialCode: "  " }],
    ["no routing", { routing: [] }],
    ["too many routing rows", { routing: Array.from({ length: 21 }, () => valid.routing[0]) }],
    ["blank operation", { routing: [{ operation: "", machineCode: "CNC-T1", cycleTimeMin: "3" }] }],
    ["two freight values", { freightPerUnit: ["2", "2"] }],
    ["unexpected type", { annualVolume: 180000 }],
  ])("rejects %s", (_name, patch) => {
    expect(costingFormSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("trims whitespace around numbers", () => {
    const r = costingFormSchema.parse({ ...valid, grossWeightKg: " 0.61 " });
    expect(r.grossWeightKg).toBe("0.61");
  });
});

describe("savePayloadSchema", () => {
  it("needs a part id", () => {
    expect(savePayloadSchema.safeParse({ partId: "", form: valid }).success).toBe(false);
    expect(savePayloadSchema.safeParse({ partId: "p1", form: valid }).success).toBe(true);
  });
});

describe("updatePartFieldSchema", () => {
  it.each([
    [{ partId: "p", field: "materialCode", value: "EN8" }, true],
    [{ partId: "p", field: "grossWeightKg", value: "0.61" }, true],
    [{ partId: "p", field: "annualVolume", value: "180000" }, true],
    [{ partId: "p", field: "annualVolume", value: "1.5" }, false],
    [{ partId: "p", field: "grossWeightKg", value: "-1" }, false],
    [{ partId: "p", field: "setupCost", value: "5" }, false],
    [{ partId: "p", field: "materialCode", value: "" }, false],
    [{ partId: "p", field: "grossWeightKg", value: "0.6", accepted: true, source: "manual" }, true], // extras stripped, never trusted
  ])("%j -> %s", (input, valid) => {
    expect(updatePartFieldSchema.safeParse(input).success).toBe(valid);
  });

  it("drops client-supplied source and accepted flags", () => {
    const r = updatePartFieldSchema.parse({ partId: "p", field: "netWeightKg", value: "0.5", accepted: true, source: "email" });
    expect(r).toEqual({ partId: "p", field: "netWeightKg", value: "0.5" });
  });
});

describe("acceptFieldSchema", () => {
  it("only accepts the four AI-fillable fields", () => {
    expect(acceptFieldSchema.safeParse({ partId: "p", field: "netWeightKg" }).success).toBe(true);
    expect(acceptFieldSchema.safeParse({ partId: "p", field: "setupCost" }).success).toBe(false);
  });
});
