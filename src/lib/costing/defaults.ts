/**
 * Starting values for a new costing. ASSUMPTION (F-22): the brief gives none, so these are
 * plausible, editable starting points, not company policy. Strings, as the form holds them.
 */
export const DEFAULT_COSTING_INPUTS = {
  scrapPercent: "2",
  packingPerUnit: "1.50",
  freightPerUnit: "2.00",
  markupPercent: "10",
  gstPercent: "18",
} as const;

/** The only overhead category in use (assumption R-06). */
export const OVERHEAD_CATEGORY = "STANDARD";
