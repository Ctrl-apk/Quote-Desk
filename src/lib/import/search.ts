export const SEARCH_LIMIT = 50;
/** Assumption I-09: "similar" means the same material and a gross weight within 10%. */
export const SIMILAR_WEIGHT_TOLERANCE = 0.1;

export interface PastQuoteQuery {
  q: string;
  material: string;
  /** Quotation date range, inclusive, YYYY-MM-DD. Either end may be empty. */
  from: string | null;
  to: string | null;
  /** Gross weight in kg to find similar parts for, or null. */
  weight: string | null;
}

const isoDate = (v: string): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : null);

export function parsePastQuoteQuery(params: Record<string, string | string[] | undefined>): PastQuoteQuery {
  const one = (k: string) => { const v = params[k]; return (Array.isArray(v) ? v[0] : v)?.trim() ?? ""; };
  const w = one("weight");
  return {
    q: one("q").slice(0, 80),
    material: one("material").slice(0, 30),
    from: isoDate(one("from")),
    to: isoDate(one("to")),
    weight: /^\d{1,6}(\.\d{1,4})?$/.test(w) && Number(w) > 0 ? w : null,
  };
}

export function weightRange(weight: string): { min: number; max: number } {
  const w = Number(weight);
  return { min: w * (1 - SIMILAR_WEIGHT_TOLERANCE), max: w * (1 + SIMILAR_WEIGHT_TOLERANCE) };
}

/** Closest weight first when a weight was given, otherwise newest first. Stable for ties. */
export function rankPastQuotes<T extends { grossWeightKg: string; quotedOn: string }>(rows: readonly T[], weight: string | null): T[] {
  const target = weight === null ? null : Number(weight);
  return [...rows].sort((a, b) => {
    if (target !== null) {
      const d = Math.abs(Number(a.grossWeightKg) - target) - Math.abs(Number(b.grossWeightKg) - target);
      if (d !== 0) return d;
    }
    return b.quotedOn.localeCompare(a.quotedOn);
  });
}
