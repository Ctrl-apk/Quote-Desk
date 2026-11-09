import { describe, expect, it } from "vitest";
import { canEditRfq, canRemovePart, createRfqSchema, isRealDate, MAX_PARTS_PER_RFQ, partDraftSchema } from "@/lib/rfq/manage";

const part = { name: "Spindle", materialCode: "EN8", grossWeightKg: "1.2", netWeightKg: "0.9", annualVolume: "10000" };
const base = { customer: "Company A", dueDate: "2026-11-20", parts: [part] };
const issue = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? "" : r.error!.issues[0]!.message);

describe("createRfqSchema", () => {
  it("accepts several parts and blank optional values", () => {
    expect(createRfqSchema.safeParse({ ...base, parts: [part, { name: "Bracket" }] }).success).toBe(true);
  });
  it.each([
    ["no parts", { ...base, parts: [] }, "at least one part"],
    ["too many parts", { ...base, parts: Array.from({ length: MAX_PARTS_PER_RFQ + 1 }, () => part) }, "At most"],
    ["blank customer", { ...base, customer: "  " }, "Customer is required"],
    ["impossible date", { ...base, dueDate: "2026-02-30" }, "does not exist"],
    ["bad date shape", { ...base, dueDate: "20/11/2026" }, "YYYY-MM-DD"],
    ["blank part name", { ...base, parts: [{ ...part, name: " " }] }, "Part name is required"],
  ])("rejects %s", (_n, input, text) => expect(issue(createRfqSchema.safeParse(input))).toContain(text));
});

describe("partDraftSchema weights and volume", () => {
  it.each([
    ["net above gross", { ...part, netWeightKg: "1.3" }, "cannot exceed"],
    ["zero gross", { ...part, grossWeightKg: "0" }, "above zero"],
    ["zero net", { ...part, netWeightKg: "0" }, "above zero"],
    ["negative weight", { ...part, grossWeightKg: "-1" }, "Enter a number"],
    ["NaN", { ...part, grossWeightKg: "NaN" }, "Enter a number"],
    ["Infinity", { ...part, grossWeightKg: "Infinity" }, "Enter a number"],
    ["fractional volume", { ...part, annualVolume: "10.5" }, "whole number"],
    ["zero volume", { ...part, annualVolume: "0" }, "at least 1"],
  ])("rejects %s", (_n, input, text) => expect(issue(partDraftSchema.safeParse(input))).toContain(text));
  it("allows net equal to gross", () => expect(partDraftSchema.safeParse({ ...part, netWeightKg: "1.2" }).success).toBe(true));
});

describe("rules", () => {
  it("recognises real dates only", () => {
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("2026-02-29")).toBe(false);
  });
  it("edits only while estimating", () => {
    expect(canEditRfq("estimating").ok).toBe(true);
    for (const s of ["sent", "won", "lost"] as const) expect(canEditRfq(s).ok).toBe(false);
  });
  it("removes a part only if it is unquoted and not the last one", () => {
    expect(canRemovePart({ partCount: 2, quoteCount: 0 }).ok).toBe(true);
    expect(canRemovePart({ partCount: 2, quoteCount: 1 }).ok).toBe(false);
    expect(canRemovePart({ partCount: 1, quoteCount: 0 }).ok).toBe(false);
  });
});
