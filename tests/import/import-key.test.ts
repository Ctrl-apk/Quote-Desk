import { describe, expect, it } from "vitest";
import { pastQuoteImportKey } from "@/lib/import/import-key";

const row = { customer: "Company B", partName: "Rear wheel spindle", materialCode: "EN8", quoteRef: "Q-2601-014", quotedOn: "2026-01-14" };

describe("pastQuoteImportKey", () => {
  it("is stable for the same row", () => {
    expect(pastQuoteImportKey(row)).toBe(pastQuoteImportKey({ ...row }));
    expect(pastQuoteImportKey(row)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("ignores case and stray whitespace", () => {
    expect(pastQuoteImportKey({ ...row, customer: "  company  b ", materialCode: "en8" })).toBe(pastQuoteImportKey(row));
  });
  it.each(["customer", "partName", "materialCode", "quoteRef", "quotedOn"] as const)("changes when %s changes", (field) => {
    expect(pastQuoteImportKey({ ...row, [field]: "different" })).not.toBe(pastQuoteImportKey(row));
  });
});
