/** RFQ-YYMM-NNN, numbered within the month (assumption I-08). Gaps are fine; duplicates are not. */
export function nextRfqNo(existing: readonly string[], today: string): string {
  const prefix = `RFQ-${today.slice(2, 4)}${today.slice(5, 7)}-`;
  let max = 0;
  for (const no of existing) {
    if (!no.startsWith(prefix)) continue;
    const n = Number(no.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
