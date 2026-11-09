import { describe, expect, it } from "vitest";
import { parsePartList } from "@/lib/intake/part-list";
import { MAX_PARTS_PER_RFQ } from "@/lib/rfq/manage";

const H = ["part_name", "part_number", "material", "gross_weight_kg", "net_weight_kg", "annual_volume", "drawing_ref"];
const MATERIALS = ["EN8", "40Cr4", "20MnCr5"];

describe("parsePartList", () => {
  it("copies each cell as written and keeps blanks blank", () => {
    const r = parsePartList([H, ["Rear wheel spindle", "RWS-01", "EN8", "0.61", "", "180000", "DRG-77"], ["Bracket", "", "", "", "", "", ""]], MATERIALS);
    expect(r.fatal).toBeUndefined();
    expect(r.parts).toHaveLength(2);
    expect(r.parts[0]!.part).toMatchObject({ name: "Rear wheel spindle", partNumber: "RWS-01", materialCode: "EN8", grossWeightKg: "0.61", netWeightKg: "", annualVolume: "180000", drawingRef: "DRG-77" });
    expect(r.parts[1]!.part).toMatchObject({ name: "Bracket", materialCode: "", grossWeightKg: "", annualVolume: "" });
  });

  it("accepts columns in any order and headers in any case, and only part_name is required", () => {
    const r = parsePartList([["ANNUAL_VOLUME", "Part_Name"], ["500", "Pin"]], MATERIALS);
    expect(r.parts[0]!.part).toMatchObject({ name: "Pin", annualVolume: "500" });
  });

  it("matches materials case-insensitively but never invents one: an unknown material is dropped with a warning", () => {
    const r = parsePartList([H, ["A", "", "en8", "", "", "", ""], ["B", "", "Unobtainium", "", "", "", ""]], MATERIALS);
    expect(r.parts[0]!.part.materialCode).toBe("EN8");
    expect(r.parts[1]!.part.materialCode).toBe("");
    expect(r.warnings).toEqual([{ line: 3, text: expect.stringContaining("Unobtainium") }]);
  });

  it("reports bad rows by line number and keeps the good ones", () => {
    const r = parsePartList([H, ["Good", "", "", "1", "", "10", ""], ["", "", "", "", "", "", "x"], ["Neg", "", "", "-1", "", "", ""], ["Net>gross", "", "", "1", "2", "", ""], ["Words", "", "", "", "", "many", ""]], MATERIALS);
    expect(r.parts.map((p) => p.part.name)).toEqual(["Good"]);
    expect(r.problems.map((p) => p.line)).toEqual([3, 4, 5, 6]);
    expect(r.problems[0]!.reason).toMatch(/part name/i);
    expect(r.problems[2]!.reason).toMatch(/net weight/i);
  });

  it("rejects NaN, Infinity and exponent forms as weights", () => {
    const r = parsePartList([H, ["A", "", "", "NaN", "", "", ""], ["B", "", "", "Infinity", "", "", ""], ["C", "", "", "1e3", "", "", ""]], MATERIALS);
    expect(r.parts).toHaveLength(0);
    expect(r.problems).toHaveLength(3);
  });

  it("ignores fully blank rows", () => {
    const r = parsePartList([H, ["A", "", "", "", "", "", ""], ["", "", "", "", "", "", ""], ["B", "", "", "", "", "", ""]], MATERIALS);
    expect(r.parts.map((p) => p.line)).toEqual([2, 4]);
  });

  it("fails clearly on an empty file, a missing part_name column, a header-only file and too many parts", () => {
    expect(parsePartList([], MATERIALS).fatal).toMatch(/empty/i);
    expect(parsePartList([["name"], ["x"]], MATERIALS).fatal).toMatch(/part_name/);
    expect(parsePartList([H], MATERIALS).fatal).toMatch(/no rows/i);
    const many = [H, ...Array.from({ length: MAX_PARTS_PER_RFQ + 1 }, (_, i) => [`P${i}`, "", "", "", "", "", ""])];
    expect(parsePartList(many, MATERIALS).fatal).toMatch(/at most 20/);
  });
});
