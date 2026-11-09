import { addDaysIso } from "@/lib/format/dates";
import type { IsoDate } from "./types";

export type RateStanding = "current" | "scheduled" | "superseded";

export interface HistoryEntry<T> {
  row: T;
  standing: RateStanding;
  /**
   * Last day this version applies: the day before the next version starts, or null while it is the newest.
   * Derived, never stored. Versions of one code therefore cannot overlap and cannot leave a gap.
   */
  effectiveTo: IsoDate | null;
}

/**
 * Groups rows by code, newest first, and says which one is in force today.
 * "current" is the row a quote dated today would use (latest effectiveFrom on or before today),
 * "scheduled" starts later, everything else is "superseded" (kept for the record).
 */
export function rateHistory<T extends { effectiveFrom: IsoDate }>(
  rows: readonly T[],
  codeOf: (row: T) => string,
  today: IsoDate,
): { code: string; entries: HistoryEntry<T>[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(codeOf(row), [...(groups.get(codeOf(row)) ?? []), row]);
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, list]) => {
      const sorted = [...list].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
      const currentIdx = sorted.findIndex((r) => r.effectiveFrom <= today);
      return {
        code,
        entries: sorted.map((row, i) => ({
          row,
          standing: row.effectiveFrom > today ? ("scheduled" as const) : i === currentIdx ? ("current" as const) : ("superseded" as const),
          effectiveTo: i === 0 ? null : addDaysIso(sorted[i - 1]!.effectiveFrom, -1),
        })),
      };
    });
}
