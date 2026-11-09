import { describe, expect, it } from "vitest";
import { MALFORMED_CSV_ROWS, PAST_QUOTES, pastQuotesCsv } from "../../prisma/seed-data";
import { parseCsv } from "@/lib/import/csv";
import { parsePastQuoteQuery, rankPastQuotes, weightRange } from "@/lib/import/search";
import { MAX_IMPORT_ROWS, parseRoutingCell, validatePastQuoteRows } from "@/lib/import/past-quotes";

const HEADER = "customer,part_name,material,gross_weight_kg,routing,price_per_unit,quote_ref,quoted_on";
const good = "Company B,Brake pin,EN8,0.4100,Turning:CNC-T1:2.5,72.10,Q-1,2026-02-10";

describe("parseCsv", () => {
  it("handles quotes, commas, doubled quotes, CRLF, BOM and blank trailing line", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });
  it("keeps line breaks inside quotes", () => expect(parseCsv('a\n"1\n2",3')).toEqual([["a"], ["1\n2", "3"]]));
  it("never throws on junk", () => expect(() => parseCsv('"unterminated,\n')).not.toThrow());
});

describe("validatePastQuoteRows on the demo file", () => {
  const report = validatePastQuoteRows(parseCsv(pastQuotesCsv()));
  it("accepts all 30 good rows and rejects the 5 broken ones with the right reasons", () => {
    expect(report.fatal).toBeUndefined();
    expect(report.rows).toHaveLength(PAST_QUOTES.length);
    expect(report.problems.map((p) => p.reason)).toEqual(MALFORMED_CSV_ROWS.map((m) => m.reason));
  });
  it("reports the line number of each problem", () => {
    const lines = pastQuotesCsv().split("\n");
    for (const p of report.problems) expect(MALFORMED_CSV_ROWS.some((m) => lines[p.line - 1] === m.line)).toBe(true);
  });
});

describe("validatePastQuoteRows edge cases", () => {
  const run = (...rows: string[]) => validatePastQuoteRows(parseCsv([HEADER, ...rows].join("\n")));
  it("one bad line does not block the others", () => {
    const r = run(good, "x,y,,1,A:B:1,5,Q,2026-01-01", good.replace("Q-1", "Q-2"));
    expect(r.rows).toHaveLength(2);
    expect(r.problems).toEqual([{ line: 3, reason: "material is missing" }]);
  });
  it("collapses repeats inside the file, ignoring case and spacing", () => {
    const r = run(good, good.toUpperCase().replace("TURNING:CNC-T1", "Turning:CNC-T1"));
    expect(r.rows).toHaveLength(1);
    expect(r.repeatedInFile).toBe(1);
  });
  it("rejects zero price, zero weight, impossible dates and bad routing minutes", () => {
    const reasons = [good.replace("72.10", "0"), good.replace("0.4100", "0"), good.replace("2026-02-10", "2026-02-30"), good.replace("2.5", "0")].map((l) => run(l).problems[0]?.reason);
    expect(reasons).toEqual(["price is not a number", "gross weight is not a number", "quoted_on is not a valid date", "routing is not operation:machine:minutes"]);
  });
  it("rejects spreadsheet formula-like numbers and exponents", () => {
    expect(run(good.replace("72.10", "=1+1")).rows).toHaveLength(0);
    expect(run(good.replace("72.10", "1e3")).rows).toHaveLength(0);
  });
  it("fails the whole file for empty, headerless, missing columns, or too many rows", () => {
    expect(validatePastQuoteRows([]).fatal).toMatch(/empty/);
    expect(validatePastQuoteRows([["customer"]]).fatal).toMatch(/Missing columns/);
    expect(validatePastQuoteRows(parseCsv(HEADER)).fatal).toMatch(/no rows/);
    const many = [HEADER, ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => good.replace("Q-1", `Q-${i}`))].join("\n");
    expect(validatePastQuoteRows(parseCsv(many)).fatal).toMatch(/Too many rows/);
  });
  it("accepts columns in any order and any header case", () => {
    const r = validatePastQuoteRows([["Quoted_On", "QUOTE_REF", "price_per_unit", "routing", "gross_weight_kg", "material", "part_name", "customer"], ["2026-02-10", "Q-1", "72.10", "Turning:CNC-T1:2.5", "0.41", "EN8", "Pin", "Company B"]]);
    expect(r.rows[0]).toMatchObject({ customer: "Company B", materialCode: "EN8", quotedOn: "2026-02-10" });
  });
});

describe("parseRoutingCell", () => {
  it("parses several steps", () => expect(parseRoutingCell("Turning:CNC-T1:3.2; Drilling:DRL-1:0.6")).toHaveLength(2));
  it("rejects empties and wrong shapes", () => {
    for (const bad of ["", "Turning-CNC-T1-3", "Turning:CNC-T1", "Turning::3", ":CNC:3"]) expect(typeof parseRoutingCell(bad)).toBe("string");
  });
});

describe("search helpers", () => {
  it("parses and bounds the query", () => {
    expect(parsePastQuoteQuery({ q: " spindle ", material: "EN8", weight: "0.6" })).toEqual({ q: "spindle", material: "EN8", weight: "0.6", from: null, to: null });
    expect(parsePastQuoteQuery({ from: "2025-03-01", to: "2025-03-31" })).toMatchObject({ from: "2025-03-01", to: "2025-03-31" });
    expect(parsePastQuoteQuery({ from: "2025-02-30", to: "yesterday" })).toMatchObject({ from: null, to: null });
    expect(parsePastQuoteQuery({ weight: "abc" }).weight).toBeNull();
    expect(parsePastQuoteQuery({ weight: "-1" }).weight).toBeNull();
    expect(parsePastQuoteQuery({ q: "x".repeat(200) }).q).toHaveLength(80);
  });
  it("similar means within 10% of the weight", () => {
    const { min, max } = weightRange("1");
    expect([min, max]).toEqual([0.9, 1.1]);
  });
  it("ranks by closeness to the weight, then newest", () => {
    const rows = [{ grossWeightKg: "0.70", quotedOn: "2026-01-01" }, { grossWeightKg: "0.61", quotedOn: "2025-01-01" }, { grossWeightKg: "0.61", quotedOn: "2026-05-01" }];
    expect(rankPastQuotes(rows, "0.6").map((r) => `${r.grossWeightKg}@${r.quotedOn}`)).toEqual(["0.61@2026-05-01", "0.61@2025-01-01", "0.70@2026-01-01"]);
    expect(rankPastQuotes(rows, null)[0]!.quotedOn).toBe("2026-05-01");
  });
});
