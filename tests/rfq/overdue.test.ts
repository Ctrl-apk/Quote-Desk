import { describe, expect, it } from "vitest";
import { isOverdue } from "@/lib/rfq/overdue";

describe("isOverdue", () => {
  it("is overdue when estimating and past due", () => {
    expect(isOverdue("estimating", "2026-11-01", "2026-11-03")).toBe(true);
  });
  it("is not overdue on the due date itself", () => {
    expect(isOverdue("estimating", "2026-11-03", "2026-11-03")).toBe(false);
  });
  it("is not overdue before the due date", () => {
    expect(isOverdue("estimating", "2026-11-10", "2026-11-03")).toBe(false);
  });
  it.each(["sent", "won", "lost"] as const)("is never overdue once %s", (status) => {
    expect(isOverdue(status, "2026-01-01", "2026-11-03")).toBe(false);
  });
});
