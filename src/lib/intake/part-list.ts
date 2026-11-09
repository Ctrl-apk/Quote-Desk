import { describeHeaders, mapHeaders, PART_LIST_ALIASES } from "@/lib/import/headers";
import { partDraftSchema, MAX_PARTS_PER_RFQ, type PartDraft } from "@/lib/rfq/manage";

/**
 * Reads a customer's Excel/CSV part list into parts. No AI and no network: each cell is copied as
 * written and checked, nothing is inferred. A blank cell stays blank. Pure.
 *
 * Columns (header row, any order, case-insensitive): part_name is required; part_number, material,
 * gross_weight_kg, net_weight_kg, annual_volume and drawing_ref are optional.
 */
export const PART_LIST_COLUMNS = ["part_name", "part_number", "material", "gross_weight_kg", "net_weight_kg", "annual_volume", "drawing_ref"] as const;

export interface PartListRow {
  line: number;
  part: PartDraft;
}
export interface PartListReport {
  parts: PartListRow[];
  problems: { line: number; reason: string }[];
  /** Things the estimator should know that do not block a row (a material with no rate master). */
  warnings: { line: number; text: string }[];
  fatal?: string;
}

const FIELD_NAMES: Record<string, string> = {
  name: "part name", materialCode: "material", grossWeightKg: "gross weight", netWeightKg: "net weight", annualVolume: "annual volume", partNumber: "part number", drawingRef: "drawing reference",
};

export function parsePartList(table: string[][], knownMaterials: readonly string[]): PartListReport {
  const empty: PartListReport = { parts: [], problems: [], warnings: [] };
  if (table.length === 0) return { ...empty, fatal: "The file is empty." };
  const col = mapHeaders(table[0]!, PART_LIST_COLUMNS, PART_LIST_ALIASES);
  if (col.part_name < 0) return { ...empty, fatal: `Missing column: part_name. Expected: ${PART_LIST_COLUMNS.join(", ")} (only part_name is required). ${describeHeaders(table[0]!)}` };
  const body = table.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  if (body.length === 0) return { ...empty, fatal: "The file has a header but no rows." };

  const known = new Map(knownMaterials.map((m) => [m.toLowerCase(), m]));
  const report: PartListReport = { parts: [], problems: [], warnings: [] };

  table.forEach((cells, i) => {
    if (i === 0 || cells.every((c) => c.trim() === "")) return;
    const line = i + 1;
    const get = (c: (typeof PART_LIST_COLUMNS)[number]) => (col[c] >= 0 ? (cells[col[c]] ?? "").trim() : "");

    let material = get("material");
    if (material) {
      const match = known.get(material.toLowerCase());
      if (match) material = match;
      else {
        report.warnings.push({ line, text: `material "${material}" has no rate master, so it was left blank. Choose one on the costing screen.` });
        material = "";
      }
    }
    const draft = {
      name: get("part_name"), partNumber: get("part_number"), materialCode: material, grossWeightKg: get("gross_weight_kg"),
      netWeightKg: get("net_weight_kg"), annualVolume: get("annual_volume"), drawingRef: get("drawing_ref"),
    };
    const parsed = partDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const field = FIELD_NAMES[String(issue.path[0])] ?? String(issue.path[0] ?? "row");
      report.problems.push({ line, reason: `${field}: ${issue.message}` });
      return;
    }
    report.parts.push({ line, part: parsed.data });
  });

  if (report.parts.length > MAX_PARTS_PER_RFQ) {
    return { ...empty, fatal: `${report.parts.length} valid parts found. One RFQ takes at most ${MAX_PARTS_PER_RFQ}; split the list.` };
  }
  return report;
}
