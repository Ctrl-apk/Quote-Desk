/**
 * Column-name matching for imported files. A customer's or colleague's spreadsheet will not use our
 * exact names, so a header is matched after ignoring case, spacing and punctuation ("Gross weight (kg)"
 * is gross_weight_kg), and a short list of plain aliases is accepted. Nothing is guessed beyond that:
 * a column that matches neither is ignored, and a missing required column is reported by name together
 * with the headers that were found. Pure.
 */
export const normaliseHeader = (raw: string): string => raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** canonical column -> other names accepted for it (already in normalised form). */
export type HeaderAliases = Record<string, readonly string[]>;

/** The canonical name for a header cell, or its normalised text when it is not one we know. */
export function canonicalHeader(raw: string, aliases: HeaderAliases): string {
  const n = normaliseHeader(raw);
  for (const [canonical, others] of Object.entries(aliases)) if (n === canonical || others.includes(n)) return canonical;
  return n;
}

/** Index of the first column for each canonical name (-1 when absent). If two columns map to one name the first wins. */
export function mapHeaders<C extends string>(headerRow: readonly string[], canonical: readonly C[], aliases: HeaderAliases): Record<C, number> {
  const names = headerRow.map((h) => canonicalHeader(h, aliases));
  return Object.fromEntries(canonical.map((c) => [c, names.indexOf(c)])) as Record<C, number>;
}

/** "Found: Customer Name, Part, ..." for error messages (capped so a wide sheet stays readable). */
export function describeHeaders(headerRow: readonly string[]): string {
  const shown = headerRow.map((h) => h.trim()).filter(Boolean);
  if (shown.length === 0) return "The first row has no column names.";
  return `Found: ${shown.slice(0, 12).join(", ")}${shown.length > 12 ? ", …" : ""}.`;
}

export const PAST_QUOTE_ALIASES: HeaderAliases = {
  customer: ["customer_name", "client", "client_name"],
  part_name: ["part", "part_description", "description", "item", "item_name"],
  part_number: ["part_no", "part_code", "item_code", "drg_no"],
  material: ["material_grade", "material_code", "grade"],
  gross_weight_kg: ["gross_weight", "gross_wt", "gross_wt_kg", "weight_kg", "weight"],
  routing: ["operations", "process", "process_routing"],
  price_per_unit: ["unit_price", "price", "quoted_price", "rate_per_piece", "price_per_piece"],
  quote_ref: ["rfq_no", "rfq_number", "rfq_ref", "rfq", "quote_no", "quote_number", "quotation_no", "quotation_ref"],
  quoted_on: ["quote_date", "quotation_date", "date", "quoted_date"],
};

export const PART_LIST_ALIASES: HeaderAliases = {
  part_name: ["part", "part_description", "description", "item", "item_name"],
  part_number: ["part_no", "part_code", "item_code"],
  material: ["material_grade", "material_code", "grade"],
  gross_weight_kg: ["gross_weight", "gross_wt", "gross_wt_kg"],
  net_weight_kg: ["net_weight", "net_wt", "net_wt_kg", "finished_weight_kg", "finish_weight_kg"],
  annual_volume: ["annual_qty", "annual_quantity", "volume", "eau", "yearly_volume", "qty_per_year"],
  drawing_ref: ["drawing", "drawing_no", "drawing_number", "drg_ref", "drg_no", "drawing_reference"],
};
