import { describe, expect, it } from "vitest";
import { navFor } from "@/components/layout/nav";

describe("navFor", () => {
  it("hides the intake desk from the sales head, who cannot create RFQs", () => {
    expect(navFor("sales_head").map((i) => i.href)).toEqual(["/rfqs", "/quotes", "/past-quotes", "/rates"]);
    expect(navFor("estimator").map((i) => i.href)).toEqual(["/rfqs", "/intake", "/quotes", "/past-quotes", "/rates"]);
  });
});

describe("titles for the RFQ screens", () => {
  it("names the new RFQ and RFQ detail pages", async () => {
    const { titleForPath } = await import("@/components/layout/nav");
    expect(titleForPath("/rfqs/new")).toBe("New RFQ");
    expect(titleForPath("/rfqs/abc123")).toBe("RFQ");
    expect(titleForPath("/rfqs/abc123/parts/p1")).toBe("Part costing");
    expect(titleForPath("/rfqs")).toBe("RFQs");
  });
});
