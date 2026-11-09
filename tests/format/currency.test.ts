import { describe, expect, it } from "vitest";
import { formatNumberIndian, formatRupees } from "@/lib/format/currency";

describe("formatRupees", () => {
  it.each([
    [125000, "₹ 1,25,000.00"],
    [2500000, "₹ 25,00,000.00"],
    [12345678.9, "₹ 1,23,45,678.90"],
    [999, "₹ 999.00"],
    [1000, "₹ 1,000.00"],
    [99999, "₹ 99,999.00"],
    [0, "₹ 0.00"],
    ["45.333333", "₹ 45.33"],
    ["999.995", "₹ 1,000.00"],
    [-1250, "-₹ 1,250.00"],
    ["-0.001", "₹ 0.00"],
  ])("%s → %s", (input, expected) => {
    expect(formatRupees(input)).toBe(expected);
  });

  it("throws on missing or non-numeric input rather than printing garbage", () => {
    expect(() => formatRupees(undefined)).toThrow();
    expect(() => formatRupees("abc")).toThrow();
  });
});

describe("formatNumberIndian", () => {
  it("drops the symbol and keeps the grouping", () => {
    expect(formatNumberIndian(19846800)).toBe("1,98,46,800.00");
    expect(formatNumberIndian("45.333")).toBe("45.33");
    expect(formatNumberIndian(-1250)).toBe("-1,250.00");
  });
});
