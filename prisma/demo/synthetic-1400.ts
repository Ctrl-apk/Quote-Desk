/**
 * SYNTHETIC test data. Not client data.
 *
 * The client has about 1,400 historical quotation rows in Excel but did not supply them.
 * This builds a stand-in of exactly 1,400 data rows so the importer can be tested at that size.
 * Every customer is "Synthetic Customer NN", every reference starts "SYN-", and every value is
 * generated from a fixed seed, so the file is identical on every run.
 *
 * Composition (the tests assert these numbers):
 *   1,360 valid, distinct rows
 *      25 invalid rows, each broken in a known way
 *      15 exact repeats of earlier rows
 */
export const SYNTHETIC_ROWS = 1400;
export const SYNTHETIC_VALID = 1360;
export const SYNTHETIC_INVALID = 25;
export const SYNTHETIC_REPEATS = 15;

export const SYNTHETIC_HEADER = ["customer", "part_name", "part_number", "material", "gross_weight_kg", "routing", "price_per_unit", "quote_ref", "quoted_on"];

const MATERIALS = ["EN8", "40Cr4", "20MnCr5", "EN19", "C45"];
const PARTS = ["Spindle", "Lift arm", "Gear blank", "Brake pin", "Hub flange", "Axle shaft", "Pinion", "Yoke", "Coupling", "Bush"];
const OPS: [string, string][] = [["Turning", "CNC-T1"], ["Milling", "VMC-1"], ["Drilling", "DRL-1"], ["Grinding", "GRD-1"]];

/** Small deterministic generator (mulberry32). Not for security. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number, w: number) => String(n).padStart(w, "0");

function validRow(i: number, rand: () => number): string[] {
  const material = MATERIALS[Math.floor(rand() * MATERIALS.length)]!;
  const part = PARTS[Math.floor(rand() * PARTS.length)]!;
  const weight = (0.2 + rand() * 7.8).toFixed(4);
  const steps = 1 + Math.floor(rand() * 3);
  const routing = Array.from({ length: steps }, (_, s) => {
    const [op, machine] = OPS[(i + s) % OPS.length]!;
    return `${op}:${machine}:${(0.5 + rand() * 11).toFixed(1)}`;
  }).join(";");
  const price = (20 + Number(weight) * 85 + rand() * 40).toFixed(2);
  const month = 1 + Math.floor(rand() * 12);
  const year = 2024 + Math.floor(rand() * 3);
  const day = 1 + Math.floor(rand() * 28);
  const customer = `Synthetic Customer ${pad(1 + Math.floor(rand() * 12), 2)}`;
  return [customer, `${part} ${pad(i, 4)}`, `SYN-P-${pad(i, 5)}`, material, weight, routing, price, `SYN-${pad(year % 100, 2)}${pad(month, 2)}-${pad(i, 4)}`, `${year}-${pad(month, 2)}-${pad(day, 2)}`];
}

/** Each way a row can be wrong, with the importer's message. */
export const SYNTHETIC_BREAKS: { reason: string; apply: (r: string[]) => string[] }[] = [
  { reason: "customer is missing", apply: (r) => { r[0] = ""; return r; } },
  { reason: "material is missing", apply: (r) => { r[3] = ""; return r; } },
  { reason: "gross weight is not a number", apply: (r) => { r[4] = "heavy"; return r; } },
  { reason: "price is negative", apply: (r) => { r[6] = "-12.50"; return r; } },
  { reason: "quoted_on is not a valid date", apply: (r) => { r[8] = "2026-02-31"; return r; } },
];

export interface SyntheticDataset {
  table: string[][];
  /** Line numbers (header is line 1) of the invalid rows, with the reason each should give. */
  invalidLines: { line: number; reason: string }[];
}

export function buildSynthetic(): SyntheticDataset {
  const rand = rng(2611);
  const valid = Array.from({ length: SYNTHETIC_VALID }, (_, i) => validRow(i + 1, rand));
  const body: { row: string[]; broken?: string }[] = valid.map((row) => ({ row }));
  // Repeats: copies of rows already in the list, placed later in the file.
  for (let k = 0; k < SYNTHETIC_REPEATS; k++) body.push({ row: [...valid[k * 7]!] });
  // Invalid rows: fresh rows (not copies) broken in a rotating way.
  for (let k = 0; k < SYNTHETIC_INVALID; k++) {
    const b = SYNTHETIC_BREAKS[k % SYNTHETIC_BREAKS.length]!;
    body.push({ row: b.apply(validRow(SYNTHETIC_VALID + k + 1, rand)), broken: b.reason });
  }
  // Deterministic shuffle so problems are spread through the file.
  for (let i = body.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [body[i], body[j]] = [body[j]!, body[i]!];
  }
  // A repeat must come after the row it copies, or the "first one wins" rule would swap which is the repeat.
  // The copies are exact, so either order gives the same counts; the tests rely on counts, not on which line.
  const invalidLines = body.flatMap((b, i) => (b.broken ? [{ line: i + 2, reason: b.broken }] : []));
  return { table: [SYNTHETIC_HEADER, ...body.map((b) => b.row)], invalidLines };
}
