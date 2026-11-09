import { describe, expect, it } from "vitest";
import { MAX_SEARCH_LENGTH, clearedFilters, defaultDir, parseRfqFilters, rfqFiltersToQuery, toggleSort } from "@/lib/rfq/filters";

describe("parseRfqFilters", () => {
  it("defaults to everything", () => {
    expect(parseRfqFilters({})).toEqual({ mine: false, status: null, q: "", sort: "due", dir: "asc" });
  });
  it("reads scope, status and search", () => {
    expect(parseRfqFilters({ scope: "mine", status: "lost", q: "spindle" })).toEqual({ mine: true, status: "lost", q: "spindle", sort: "due", dir: "asc" });
  });
  it.each(["archived", "", "ESTIMATING", "estimating,sent", "' OR 1=1 --"])("ignores unknown status %j", (status) => {
    expect(parseRfqFilters({ status }).status).toBeNull();
  });
  it("treats any other scope as all", () => {
    expect(parseRfqFilters({ scope: "everyone" }).mine).toBe(false);
  });
  it("trims and collapses whitespace, and caps the length", () => {
    expect(parseRfqFilters({ q: "  gear    blank  " }).q).toBe("gear blank");
    expect(parseRfqFilters({ q: "x".repeat(500) }).q).toHaveLength(MAX_SEARCH_LENGTH);
  });
  it("uses the first value when a parameter repeats", () => {
    expect(parseRfqFilters({ status: ["won", "lost"], q: ["a", "b"] })).toMatchObject({ status: "won", q: "a" });
  });
});

describe("rfqFiltersToQuery", () => {
  it("omits defaults", () => {
    expect(rfqFiltersToQuery({ mine: false, status: null, q: "", sort: "due", dir: "asc" })).toBe("");
  });
  it("round-trips", () => {
    const f = { mine: true, status: "sent" as const, q: "gear & pinion", sort: "customer" as const, dir: "desc" as const };
    expect(parseRfqFilters(Object.fromEntries(new URLSearchParams(rfqFiltersToQuery(f))))).toEqual(f);
  });
});

describe("sorting", () => {
  it("defaults to due date soonest first, and received to newest first", () => {
    expect(parseRfqFilters({})).toMatchObject({ sort: "due", dir: "asc" });
    expect(parseRfqFilters({ sort: "received" })).toMatchObject({ sort: "received", dir: "desc" });
    expect(defaultDir("customer")).toBe("asc");
  });
  it("ignores unknown sort keys and directions rather than failing", () => {
    expect(parseRfqFilters({ sort: "owner; DROP TABLE", dir: "sideways" })).toMatchObject({ sort: "due", dir: "asc" });
    expect(parseRfqFilters({ sort: "customer", dir: "sideways" })).toMatchObject({ sort: "customer", dir: "asc" });
  });
  it("keeps default sorting out of the URL", () => {
    expect(rfqFiltersToQuery(parseRfqFilters({ sort: "received" }))).toBe("?sort=received");
    expect(rfqFiltersToQuery(parseRfqFilters({ sort: "received", dir: "asc" }))).toBe("?sort=received&dir=asc");
  });
  it("clicking a column sorts by it, and clicking it again reverses it", () => {
    const base = parseRfqFilters({});
    const byCustomer = toggleSort(base, "customer");
    expect(byCustomer).toMatchObject({ sort: "customer", dir: "asc" });
    expect(toggleSort(byCustomer, "customer").dir).toBe("desc");
    expect(toggleSort(toggleSort(byCustomer, "customer"), "received")).toMatchObject({ sort: "received", dir: "desc" });
  });
  it("clearing filters keeps the sort order", () => {
    const f = { ...parseRfqFilters({ sort: "customer", status: "won", q: "x", scope: "mine" }) };
    expect(clearedFilters(f)).toEqual({ mine: false, status: null, q: "", sort: "customer", dir: "asc" });
  });
});
