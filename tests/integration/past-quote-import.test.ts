import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { SYNTHETIC_INVALID, SYNTHETIC_REPEATS, SYNTHETIC_ROWS, SYNTHETIC_VALID, buildSynthetic } from "../../prisma/demo/synthetic-1400";
import { searchPastQuotes } from "@/server/repositories/past-quotes";
import { commitImport, previewImport } from "@/server/services/past-quotes";
import { db, makeUser } from "./helpers";

// SYNTHETIC data, real Excel file, real service, real Postgres.
async function xlsxFile(table: string[][], name = "synthetic-1400.xlsx"): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("past_quotes");
  table.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const Q = (over: Partial<Parameters<typeof searchPastQuotes>[0]> = {}) => ({ q: "", material: "", weight: null, from: null, to: null, ...over });

describe("1,400-row Excel import against Postgres", () => {
  const { table } = buildSynthetic();
  let estimator: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => { estimator = await makeUser("estimator"); await db().pastQuote.deleteMany(); });

  it("previews without writing, then accounts for all 1,400 rows on commit", async () => {
    const file = await xlsxFile(table);
    expect(file.size).toBeLessThan(2 * 1024 * 1024);
    const prev = await previewImport(estimator, file);
    expect(prev.ok).toBe(true);
    if (!prev.ok) return;
    expect(prev.preview.totalRows).toBe(SYNTHETIC_ROWS);
    expect(prev.preview.newRows).toBe(SYNTHETIC_VALID);
    expect(prev.preview.problems).toHaveLength(SYNTHETIC_INVALID);
    expect(prev.preview.repeatedInFile).toBe(SYNTHETIC_REPEATS);
    expect(await db().pastQuote.count()).toBe(0);

    const done = await commitImport(estimator, file);
    expect(done).toMatchObject({ ok: true, inserted: SYNTHETIC_VALID, problems: SYNTHETIC_INVALID });
    expect(await db().pastQuote.count()).toBe(SYNTHETIC_VALID);
  });

  it("a second upload of the same file inserts nothing", async () => {
    const again = await commitImport(estimator, await xlsxFile(table));
    expect(again).toMatchObject({ ok: true, inserted: 0 });
    expect(await db().pastQuote.count()).toBe(SYNTHETIC_VALID);
  });

  it("stores the original values untouched", async () => {
    const row = await db().pastQuote.findFirstOrThrow({ orderBy: { quoteRef: "asc" } });
    const src = table.find((r) => r[7] === row.quoteRef)!;
    expect(src).toBeDefined();
    expect(row.pricePerUnit.toFixed(2)).toBe(Number(src[6]).toFixed(2));
    expect(row.grossWeightKg.toFixed(4)).toBe(Number(src[4]).toFixed(4));
    expect(row.quotedOn.toISOString().slice(0, 10)).toBe(src[8]);
  });

  describe("search finds a known row by each field the brief lists", () => {
    let target: { id: string; customer: string; partName: string; partNumber: string | null; quoteRef: string; materialCode: string; quotedOn: Date };
    beforeAll(async () => { target = await db().pastQuote.findFirstOrThrow({ where: { partNumber: { not: null } }, orderBy: { quoteRef: "asc" } }); });
    const found = async (q: ReturnType<typeof Q>) => (await searchPastQuotes(q)).rows.some((r) => r.id === target.id);

    // A customer has about a hundred quotes and the list shows 50, so narrow by the date too.
    it("customer", async () => { const d = target.quotedOn.toISOString().slice(0, 10); expect(await found(Q({ q: target.customer, from: d, to: d }))).toBe(true); });
    it("part name", async () => expect(await found(Q({ q: target.partName }))).toBe(true)); // names carry a unique 4-digit suffix
    it("part number", async () => expect(await found(Q({ q: target.partNumber! }))).toBe(true));
    it("RFQ / quote reference", async () => expect(await found(Q({ q: target.quoteRef }))).toBe(true));
    it("material", async () => expect(await found(Q({ material: target.materialCode, q: target.partNumber! }))).toBe(true));
    it("quotation date, exact and as a range", async () => {
      const d = target.quotedOn.toISOString().slice(0, 10);
      const exact = await searchPastQuotes(Q({ from: d, to: d, q: target.partNumber! }));
      expect(exact.rows.map((r) => r.id)).toEqual([target.id]);
      expect(await found(Q({ from: "1999-01-01", to: "1999-12-31", q: target.partNumber! }))).toBe(false);
    });
    it("a date range returns only rows inside it", async () => {
      const { rows } = await searchPastQuotes(Q({ from: "2025-03-01", to: "2025-03-31" }));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.quotedOn >= "2025-03-01" && r.quotedOn <= "2025-03-31")).toBe(true);
    });
  });

  it("rejects a non-spreadsheet and an empty upload clearly", async () => {
    const bad = await previewImport(estimator, new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(bad).toMatchObject({ ok: false });
    const empty = await previewImport(estimator, new File([], "empty.csv", { type: "text/csv" }));
    expect(empty).toMatchObject({ ok: false });
  });
});
