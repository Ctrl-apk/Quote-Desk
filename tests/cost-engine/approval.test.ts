import { describe, expect, it } from "vitest";
import { APPROVAL_THRESHOLD_INR, CostInputError, requiresApproval } from "@/lib/cost-engine";

describe("requiresApproval", () => {
  it("threshold is ₹25,00,000", () => {
    expect(APPROVAL_THRESHOLD_INR).toBe("2500000");
  });

  it("exactly ₹25,00,000 does not need approval", () => {
    expect(requiresApproval(2_500_000)).toBe(false);
    expect(requiresApproval("2500000.00")).toBe(false);
  });

  it("one paisa above needs approval", () => {
    expect(requiresApproval("2500000.01")).toBe(true);
    expect(requiresApproval(2_500_001)).toBe(true);
  });

  it("one paisa below does not", () => {
    expect(requiresApproval("2499999.99")).toBe(false);
  });

  it("zero does not", () => {
    expect(requiresApproval(0)).toBe(false);
  });

  it("honours a custom threshold", () => {
    expect(requiresApproval(1001, 1000)).toBe(true);
    expect(requiresApproval(1000, 1000)).toBe(false);
  });

  it("rejects negative, missing and non-numeric values", () => {
    expect(() => requiresApproval(-1)).toThrow(CostInputError);
    expect(() => requiresApproval(undefined)).toThrow(CostInputError);
    expect(() => requiresApproval("abc")).toThrow(CostInputError);
  });
});
