/** Calendar date as "YYYY-MM-DD" (assumption R-07). ISO dates sort correctly as strings. */
export type IsoDate = string;

interface RateRowBase {
  id: string;
  effectiveFrom: IsoDate;
}

/** Decimal values travel as strings so nothing is lost to floats. */
export interface MaterialRateRow extends RateRowBase {
  materialCode: string;
  ratePerKg: string;
  scrapRecoveryPerKg: string;
}

export interface MachineRateRow extends RateRowBase {
  machineCode: string;
  hourRate: string;
  efficiency: string;
}

export interface OverheadRateRow extends RateRowBase {
  category: string;
  percent: string;
}

export type RateKind = "material" | "machine" | "overhead";
