import { describe, expect, it } from "vitest";
import { canonicalHeader, mapHeaders, normaliseHeader, PART_LIST_ALIASES, PAST_QUOTE_ALIASES } from "@/lib/import/headers";
import { validatePastQuoteRows, PAST_QUOTE_COLUMNS } from "@/lib/import/past-quotes";
import { parsePartList } from "@/lib/intake/part-list";

describe("header matching", () => {
  it("ignores case, spacing and punctuation", () => {
    expect(normaliseHeader(" Gross weight (kg) ")).toBe("gross_weight_kg");
    expect(normaliseHeader("PART-NAME")).toBe("part_name");
    expect(canonicalHeader("Gross Weight (kg)", PAST_QUOTE_ALIASES)).toBe("gross_weight_kg");
  });
  it("accepts documented aliases and leaves unknown headers alone", () => {
    expect(canonicalHeader("Customer Name", PAST_QUOTE_ALIASES)).toBe("customer");
    expect(canonicalHeader("RFQ No.", PAST_QUOTE_ALIASES)).toBe("quote_ref");
    expect(canonicalHeader("EAU", PART_LIST_ALIASES)).toBe("annual_volume");
    expect(canonicalHeader("Colour", PAST_QUOTE_ALIASES)).toBe("colour");
  });
  it("uses the first column when two map to the same name", () => {
    expect(mapHeaders(["Price", "Unit price"], ["price_per_unit"], PAST_QUOTE_ALIASES).price_per_unit).toBe(0);
  });
});

describe("importers use it", () => {
  const row = ["Company A", "Spindle", "EN8", "0.61", "Turning:CNC-T1:3.2", "110.26", "RFQ-2611-014", "2026-03-04"];
  it("past quotes: a spreadsheet with natural column names imports without renaming", () => {
    const r = validatePastQuoteRows([["Customer Name", "Part Description", "Material Grade", "Gross Weight (kg)", "Operations", "Unit Price", "RFQ No.", "Quote Date"], row]);
    expect(r.fatal).toBeUndefined();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ customer: "Company A", partName: "Spindle", quoteRef: "RFQ-2611-014", quotedOn: "2026-03-04", pricePerUnit: "110.26" });
  });
  it("past quotes: a missing column is named and the headers found are listed", () => {
    const r = validatePastQuoteRows([["Customer", "Part", "Colour"], ["A", "B", "C"]]);
    expect(r.fatal).toMatch(/Missing columns: material, gross_weight_kg/);
    expect(r.fatal).toMatch(/Found: Customer, Part, Colour/);
    for (const c of PAST_QUOTE_COLUMNS) expect(r.fatal).toContain(c);
  });
  it("part list: natural names work and the error lists what was found", () => {
    const ok = parsePartList([["Part", "Drawing No", "EAU", "Gross Wt (kg)"], ["Pin", "D-9", "1200", "0.4"]], []);
    expect(ok.parts[0]!.part).toMatchObject({ name: "Pin", drawingRef: "D-9", annualVolume: "1200", grossWeightKg: "0.4" });
    expect(parsePartList([["Item no", "Qty"], ["1", "2"]], []).fatal).toMatch(/Found: Item no, Qty/);
  });
});
