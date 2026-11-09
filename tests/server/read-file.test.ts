import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ImportFileError, MAX_IMPORT_BYTES, readTable } from "@/server/import/read-file";

async function xlsxFile(rows: (string | number | Date | { formula: string; result: number })[][], name = "past.xlsx") {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  for (const r of rows) sheet.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf as ArrayBuffer], name);
}

describe("readTable (.xlsx)", () => {
  it("reads the first sheet into text, with numbers, dates and formula results as text", async () => {
    const rows = await readTable(
      await xlsxFile([["customer", "price"], ["Company A", 125.5], ["Company B", { formula: "50+50", result: 100 }], ["When", new Date("2026-10-20T00:00:00Z")]]),
    );
    expect(rows).toEqual([["customer", "price"], ["Company A", "125.5"], ["Company B", "100"], ["When", "2026-10-20"]]);
  });
  it("rejects a file that is not a real workbook", async () => {
    await expect(readTable(new File(["not a zip"], "fake.xlsx"))).rejects.toThrow("could not be read as an Excel workbook");
  });
  it("rejects an empty workbook", async () => {
    const wb = new ExcelJS.Workbook();
    const buf = await wb.xlsx.writeBuffer();
    await expect(readTable(new File([buf as ArrayBuffer], "empty.xlsx"))).rejects.toThrow(ImportFileError);
  });
});

describe("readTable (limits and types)", () => {
  it("rejects empty, oversized and unknown file types", async () => {
    await expect(readTable(new File([], "a.csv"))).rejects.toThrow("empty");
    await expect(readTable(new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], "big.csv"))).rejects.toThrow("larger than 2 MB");
    await expect(readTable(new File(["x"], "notes.txt"))).rejects.toThrow("Upload a .csv or .xlsx");
  });
  it("reads CSV", async () => {
    expect(await readTable(new File(["a,b\n1,2\n"], "t.csv"))).toEqual([["a", "b"], ["1", "2"]]);
  });
});
