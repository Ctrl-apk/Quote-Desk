import { describeHeaders, mapHeaders, PAST_QUOTE_ALIASES } from "./headers";
import { pastQuoteImportKey } from "./import-key";

export const PAST_QUOTE_COLUMNS = ["customer", "part_name", "material", "gross_weight_kg", "routing", "price_per_unit", "quote_ref", "quoted_on"] as const;
/** Accepted when present, never required, so files made before it existed still import. */
export const OPTIONAL_COLUMNS = ["part_number"] as const;
export const MAX_IMPORT_ROWS = 5000;

export interface ParsedPastQuote {
  customer: string;
  partName: string;
  partNumber: string | null;
  materialCode: string;
  grossWeightKg: string;
  routing: { operation: string; machineCode: string; cycleTimeMin: string }[];
  pricePerUnit: string;
  quoteRef: string;
  quotedOn: string;
  importKey: string;
}

export interface RowProblem {
  /** Line number in the file (header is line 1). */
  line: number;
  reason: string;
}

export interface ImportReport {
  rows: ParsedPastQuote[];
  problems: RowProblem[];
  /** Rows repeated inside the file itself (same import key). Only the first is kept. */
  repeatedInFile: number;
  /** Set when the file as a whole cannot be used (missing columns, too large, empty). */
  fatal?: string;
}

const DECIMAL = /^\d{1,8}(\.\d{1,4})?$/;
const isRealDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/** "Turning:CNC-T1:3.2;Drilling:DRL-1:0.6" -> steps, or an error message. */
export function parseRoutingCell(cell: string): ParsedPastQuote["routing"] | string {
  const steps = cell.split(";").map((s) => s.trim()).filter(Boolean);
  if (steps.length === 0) return "routing is empty";
  const out: ParsedPastQuote["routing"] = [];
  for (const step of steps) {
    const parts = step.split(":").map((p) => p.trim());
    if (parts.length !== 3 || !parts[0] || !parts[1] || !DECIMAL.test(parts[2]!) || Number(parts[2]) <= 0) return "routing is not operation:machine:minutes";
    out.push({ operation: parts[0], machineCode: parts[1], cycleTimeMin: parts[2]! });
  }
  return out;
}

/**
 * Checks every row and says exactly which line is wrong and why. Good rows are still returned,
 * so one bad line never blocks the rest of a file. Pure: the database is not involved.
 */
export function validatePastQuoteRows(table: string[][]): ImportReport {
  const empty: ImportReport = { rows: [], problems: [], repeatedInFile: 0 };
  if (table.length === 0) return { ...empty, fatal: "The file is empty." };
  const cols = mapHeaders(table[0]!, [...PAST_QUOTE_COLUMNS, ...OPTIONAL_COLUMNS], PAST_QUOTE_ALIASES);
  const missing = PAST_QUOTE_COLUMNS.filter((c) => cols[c] < 0);
  if (missing.length) return { ...empty, fatal: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Expected: ${PAST_QUOTE_COLUMNS.join(", ")}. ${describeHeaders(table[0]!)}` };
  const body = table.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  if (body.length === 0) return { ...empty, fatal: "The file has a header but no rows." };
  if (body.length > MAX_IMPORT_ROWS) return { ...empty, fatal: `Too many rows (${body.length}). The limit is ${MAX_IMPORT_ROWS} per file.` };

  const idx = cols;
  const partNumberIdx = cols.part_number;
  const report: ImportReport = { rows: [], problems: [], repeatedInFile: 0 };
  const seen = new Set<string>();

  table.forEach((cells, i) => {
    if (i === 0 || cells.every((c) => c.trim() === "")) return;
    const line = i + 1;
    const get = (c: (typeof PAST_QUOTE_COLUMNS)[number]) => (cells[idx[c]] ?? "").trim();
    const bad = (reason: string) => report.problems.push({ line, reason });

    const customer = get("customer"), partName = get("part_name"), material = get("material"), quoteRef = get("quote_ref");
    if (!customer) return bad("customer is missing");
    if (!partName) return bad("part name is missing");
    if (!material) return bad("material is missing");
    if (!quoteRef) return bad("quote reference is missing");
    if (customer.length > 80 || partName.length > 120 || material.length > 30 || quoteRef.length > 40) return bad("a text value is too long");
    const weight = get("gross_weight_kg");
    if (!DECIMAL.test(weight) || Number(weight) <= 0) return bad("gross weight is not a number");
    const price = get("price_per_unit");
    if (price.startsWith("-")) return bad("price is negative");
    if (!DECIMAL.test(price) || Number(price) <= 0) return bad("price is not a number");
    const quotedOn = get("quoted_on");
    if (!isRealDate(quotedOn)) return bad("quoted_on is not a valid date");
    const partNumber = partNumberIdx >= 0 ? (cells[partNumberIdx] ?? "").trim() : "";
    if (partNumber.length > 40) return bad("part number is too long");
    const routing = parseRoutingCell(get("routing"));
    if (typeof routing === "string") return bad(routing);

    const importKey = pastQuoteImportKey({ customer, partName, materialCode: material, quoteRef, quotedOn });
    if (seen.has(importKey)) { report.repeatedInFile++; return; }
    seen.add(importKey);
    report.rows.push({ customer, partName, partNumber: partNumber || null, materialCode: material, grossWeightKg: weight, routing, pricePerUnit: price, quoteRef, quotedOn, importKey });
  });
  return report;
}
