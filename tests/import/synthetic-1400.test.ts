import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_BREAKS, SYNTHETIC_INVALID, SYNTHETIC_REPEATS, SYNTHETIC_ROWS, SYNTHETIC_VALID, buildSynthetic,
} from "../../prisma/demo/synthetic-1400";
import { validatePastQuoteRows } from "@/lib/import/past-quotes";

// SYNTHETIC data (see prisma/demo/synthetic-1400.ts). These tests prove the importer's arithmetic at the client's stated size.
describe("importer on the synthetic 1,400-row dataset", () => {
  const { table, invalidLines } = buildSynthetic();
  const report = validatePastQuoteRows(table);

  it("has exactly 1,400 data rows and is identical on every build", () => {
    expect(table.length - 1).toBe(SYNTHETIC_ROWS);
    expect(JSON.stringify(buildSynthetic().table)).toBe(JSON.stringify(table));
  });

  it("accounts for every row: nothing lost, nothing skipped silently", () => {
    expect(report.fatal).toBeUndefined();
    expect(report.rows).toHaveLength(SYNTHETIC_VALID);
    expect(report.problems).toHaveLength(SYNTHETIC_INVALID);
    expect(report.repeatedInFile).toBe(SYNTHETIC_REPEATS);
    expect(report.rows.length + report.problems.length + report.repeatedInFile).toBe(SYNTHETIC_ROWS);
  });

  it("names the right line and reason for every invalid row", () => {
    expect(report.problems.map((p) => ({ line: p.line, reason: p.reason })).sort((a, b) => a.line - b.line)).toEqual(invalidLines);
    expect(new Set(report.problems.map((p) => p.reason))).toEqual(new Set(SYNTHETIC_BREAKS.map((b) => b.reason)));
  });

  it("keeps original values exactly as written", () => {
    const first = report.rows[0]!;
    const source = table.slice(1).find((r) => r[7] === first.quoteRef)!;
    expect([first.customer, first.partName, first.partNumber, first.materialCode, first.grossWeightKg, first.pricePerUnit, first.quoteRef, first.quotedOn])
      .toEqual([source[0], source[1], source[2], source[3], source[4], source[6], source[7], source[8]]);
  });

  it("is plainly labelled synthetic", () => {
    expect(report.rows.every((r) => r.customer.startsWith("Synthetic Customer") && r.quoteRef.startsWith("SYN-"))).toBe(true);
  });

  it("still accepts a file with no part_number column", () => {
    const without = table.map((r) => r.filter((_, i) => i !== 2));
    const r = validatePastQuoteRows(without);
    expect(r.fatal).toBeUndefined();
    expect(r.rows).toHaveLength(SYNTHETIC_VALID);
    expect(r.rows.every((x) => x.partNumber === null)).toBe(true);
  });
});
