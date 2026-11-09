import ExcelJS from "exceljs";
import { parseCsv } from "@/lib/import/csv";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export class ImportFileError extends Error {}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    // Formulas and rich text: use the stored result or plain text, never evaluate anything.
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
};

/** Reads a .csv or .xlsx upload into a plain table of strings. The first sheet is used. */
export async function readTable(file: File): Promise<string[][]> {
  if (file.size === 0) throw new ImportFileError("The file is empty.");
  if (file.size > MAX_IMPORT_BYTES) throw new ImportFileError("The file is larger than 2 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") return parseCsv(await file.text());
  if (name.endsWith(".xlsx")) {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await file.arrayBuffer()) as ExcelJS.Buffer);
      const sheet = wb.worksheets[0];
      if (!sheet) throw new ImportFileError("The workbook has no sheets.");
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, (row) => {
        const cells: string[] = [];
        for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value));
        rows.push(cells);
      });
      return rows;
    } catch (error) {
      if (error instanceof ImportFileError) throw error;
      throw new ImportFileError("That file could not be read as an Excel workbook.");
    }
  }
  throw new ImportFileError("Upload a .csv or .xlsx file.");
}
