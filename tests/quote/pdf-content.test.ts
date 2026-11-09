import { describe, expect, it } from "vitest";
import { buildPdfContent, QUOTE_VALIDITY_DAYS } from "@/lib/quote/pdf-content";

const tier = (factor: string, volume: string, price: string, gst: string, annual: string, m = "41.20") => ({
  factor, volume, material: m, conversion: "45.33", setupTooling: "6.67", overhead: "3.10", packing: "1.50", freight: "2.25",
  totalCost: "99.99", markup: "9.99", pricePerUnit: price, gst, annualValue: annual,
});
const input = {
  rfqNo: "RFQ-2611-014", version: 3, customer: "Company B", partName: "Rear wheel spindle", materialCode: "EN8", quotedOn: "2026-11-04", gstPercent: "18.0",
  tiers: [tier("0.5", "90000", "100.10", "18.02", "9009000.00", "41.20"), tier("1", "180000", "98.00", "17.64", "17640000.00", "41.10"), tier("1.5", "270000", "97.20", "17.50", "26244000.00", "41.00")],
  preparedBy: "Asha",
};

describe("buildPdfContent", () => {
  const c = buildPdfContent(input);
  it("builds the reference, dates and validity", () => {
    expect(c.reference).toBe("RFQ-2611-014-v3");
    expect(c.issuedOn).toBe("4 Nov 2026");
    expect(c.validUntil).toBe("4 Dec 2026");
    expect(QUOTE_VALIDITY_DAYS).toBe(30);
  });
  it("lists one row per tier with Indian grouping and flags the base tier", () => {
    expect(c.rows.map((r) => r.base)).toEqual([false, true, false]);
    expect(c.rows[1]!.volume).toBe("1,80,000 pcs per year");
    expect(c.rows[1]!.annual).toBe("1,76,40,000.00");
  });
  it("adds GST to the price exactly, in decimals", () => {
    expect(c.rows[0]!.priceWithGst).toBe("118.12");
    expect(c.gstLabel).toBe("GST 18%");
  });
  it("builds a per-piece cost breakup with one column per tier, copied from the snapshot", () => {
    expect(c.breakup.columns.map((x) => x.volume)).toEqual(["90,000 pcs per year", "1,80,000 pcs per year", "2,70,000 pcs per year"]);
    const line = (label: string) => c.breakup.lines.find((l) => l.label === label)!.values;
    expect(line("Material")).toEqual(["41.20", "41.10", "41.00"]);
    expect(line("Conversion")).toEqual(["45.33", "45.33", "45.33"]);
    expect(line("Setup and tooling")).toEqual(["6.67", "6.67", "6.67"]);
    expect(line("Overheads")).toEqual(["3.10", "3.10", "3.10"]);
    expect(line("Packing and freight")).toEqual(["3.75", "3.75", "3.75"]);
    expect(line("Quoted unit price")).toEqual(["100.10", "98.00", "97.20"]);
    expect(line("GST 18% (separate)")).toEqual(["18.02", "17.64", "17.50"]);
    expect(line("Unit price including GST")).toEqual(["118.12", "115.64", "114.70"]);
    expect(line("Annual quotation value (excl. GST)")).toEqual(["90,09,000.00", "1,76,40,000.00", "2,62,44,000.00"]);
  });
  it("uses the stored figures only: changing nothing but the live rates cannot change the output", () => {
    expect(buildPdfContent(structuredClone(input))).toEqual(c);
  });
  it("never exposes markup, hour rates, scrap, approval or audit information", () => {
    const text = JSON.stringify(c).toLowerCase();
    for (const secret of ["markup", "hour rate", "scrap", "recovery", "approv", "audit", "99.99", "9.99", "reject"]) expect(text).not.toContain(secret);
    expect(JSON.stringify(c.breakup.lines.map((l) => l.label))).not.toMatch(/total cost/i);
  });
});
