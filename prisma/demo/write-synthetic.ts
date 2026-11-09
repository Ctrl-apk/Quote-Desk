import { writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { buildSynthetic } from "./synthetic-1400";

const { table } = buildSynthetic();
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync(path.resolve(__dirname, "synthetic-1400.csv"), table.map((r) => r.map(csvCell).join(",")).join("\n") + "\n");

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("past_quotes");
table.forEach((r) => ws.addRow(r));
wb.xlsx.writeFile(path.resolve(__dirname, "synthetic-1400.xlsx")).then(() => console.log("Wrote synthetic-1400.csv and .xlsx (SYNTHETIC data, 1,400 rows)"));
