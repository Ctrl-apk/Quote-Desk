import type { IsoDate, MachineRateRow, MaterialRateRow, OverheadRateRow } from "./types";

export interface RateRowIds {
  materials: string[];
  machines: string[];
  overhead: string[];
}

export interface RatesSnapshot {
  quotedOn: IsoDate;
  materials: MaterialRateRow[];
  machines: MachineRateRow[];
  overhead: OverheadRateRow[];
}

export interface RatesUsed {
  materials: readonly MaterialRateRow[];
  machines: readonly MachineRateRow[];
  overhead: readonly OverheadRateRow[];
}

/**
 * Builds what is stored on a quote version: (a) the ids of the rate rows used and
 * (b) a JSON-safe copy of their values. Rows are copied, so later changes to the
 * rate tables, or to the arrays passed in, can never alter a saved quote.
 */
export function buildRatesSnapshot(
  used: RatesUsed,
  quotedOn: IsoDate,
): { rateRowIds: RateRowIds; ratesSnapshot: RatesSnapshot } {
  const dedupe = <T extends { id: string }>(rows: readonly T[]): T[] =>
    [...new Map(rows.map((r) => [r.id, { ...r }])).values()];

  const materials = dedupe(used.materials);
  const machines = dedupe(used.machines);
  const overhead = dedupe(used.overhead);

  return {
    rateRowIds: {
      materials: materials.map((r) => r.id),
      machines: machines.map((r) => r.id),
      overhead: overhead.map((r) => r.id),
    },
    ratesSnapshot: { quotedOn, materials, machines, overhead },
  };
}
