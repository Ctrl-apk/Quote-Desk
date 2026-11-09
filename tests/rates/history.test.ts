import { describe, expect, it } from "vitest";
import { rateHistory } from "@/lib/rates";

const rows = [
  { c: "EN8", effectiveFrom: "2026-01-01" },
  { c: "EN8", effectiveFrom: "2026-10-01" },
  { c: "EN8", effectiveFrom: "2027-01-01" },
  { c: "EN19", effectiveFrom: "2026-03-01" },
];

describe("rateHistory", () => {
  const h = rateHistory(rows, (r) => r.c, "2026-11-04");
  it("sorts codes and puts newest first", () => {
    expect(h.map((g) => g.code)).toEqual(["EN19", "EN8"]);
    expect(h[1]!.entries.map((e) => e.row.effectiveFrom)).toEqual(["2027-01-01", "2026-10-01", "2026-01-01"]);
  });
  it("marks current, scheduled and superseded", () => {
    expect(h[1]!.entries.map((e) => e.standing)).toEqual(["scheduled", "current", "superseded"]);
  });
  it("treats a rate starting today as current", () => {
    expect(rateHistory(rows, (r) => r.c, "2026-10-01")[1]!.entries[1]!.standing).toBe("current");
  });
  it("has no current row when everything is in the future", () => {
    expect(rateHistory([{ c: "X", effectiveFrom: "2030-01-01" }], (r) => r.c, "2026-11-04")[0]!.entries[0]!.standing).toBe("scheduled");
  });
  it("derives each version's last day as the day before the next version starts; the newest is open-ended", () => {
    expect(h[1]!.entries.map((e) => e.effectiveTo)).toEqual([null, "2026-12-31", "2026-09-30"]);
  });
  it("never overlaps and never leaves a gap between consecutive versions, including across a leap day", () => {
    const leap = [{ c: "Z", effectiveFrom: "2028-02-29" }, { c: "Z", effectiveFrom: "2028-03-01" }, { c: "Z", effectiveFrom: "2028-03-02" }];
    const e = rateHistory(leap, (r) => r.c, "2028-03-01")[0]!.entries; // newest first
    expect(e.map((x) => [x.row.effectiveFrom, x.effectiveTo])).toEqual([["2028-03-02", null], ["2028-03-01", "2028-03-01"], ["2028-02-29", "2028-02-29"]]);
    for (let i = 1; i < e.length; i++) {
      // the older version ends exactly one day before the newer one begins
      const older = e[i]!, newer = e[i - 1]!;
      expect(new Date(`${newer.row.effectiveFrom}T00:00:00Z`).getTime() - new Date(`${older.effectiveTo}T00:00:00Z`).getTime()).toBe(86_400_000);
    }
  });
});
