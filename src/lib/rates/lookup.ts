import { InvalidDateError, RateDateExistsError, RateNotFoundError } from "./errors";
import type { IsoDate, MachineRateRow, MaterialRateRow, OverheadRateRow, RateKind } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string): void {
  const valid = ISO_DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
  if (!valid) throw new InvalidDateError(value);
}

/**
 * R-02 / R-03: the row with the latest effectiveFrom that is on or before `on`
 * (inclusive, so a rate starting on the quote date applies). Returns undefined when none.
 */
function pickEffective<T extends { effectiveFrom: IsoDate }>(rows: readonly T[], on: IsoDate): T | undefined {
  assertIsoDate(on);
  let best: T | undefined;
  for (const row of rows) {
    if (row.effectiveFrom > on) continue;
    if (!best || row.effectiveFrom > best.effectiveFrom) best = row;
  }
  return best;
}

function lookup<T extends { effectiveFrom: IsoDate }>(
  kind: RateKind,
  code: string,
  on: IsoDate,
  sameCodeRows: readonly T[],
): T {
  const found = pickEffective(sameCodeRows, on);
  if (found) return found;
  const earliest = sameCodeRows.map((r) => r.effectiveFrom).sort()[0];
  throw new RateNotFoundError(kind, code, on, earliest);
}

export function lookupMaterialRate(rows: readonly MaterialRateRow[], materialCode: string, on: IsoDate): MaterialRateRow {
  return lookup("material", materialCode, on, rows.filter((r) => r.materialCode === materialCode));
}

export function lookupMachineRate(rows: readonly MachineRateRow[], machineCode: string, on: IsoDate): MachineRateRow {
  return lookup("machine", machineCode, on, rows.filter((r) => r.machineCode === machineCode));
}

export function lookupOverheadRate(rows: readonly OverheadRateRow[], category: string, on: IsoDate): OverheadRateRow {
  return lookup("overhead", category, on, rows.filter((r) => r.category === category));
}

/**
 * R-04: a new rate may not reuse a date that already has a row for the same code.
 * The database unique constraint is the backstop; this gives the UI a clear message first.
 */
export function assertRateDateFree(
  kind: RateKind,
  code: string,
  effectiveFrom: IsoDate,
  existingDatesForCode: readonly IsoDate[],
): void {
  assertIsoDate(effectiveFrom);
  if (existingDatesForCode.includes(effectiveFrom)) throw new RateDateExistsError(kind, code, effectiveFrom);
}
