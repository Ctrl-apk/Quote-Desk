import { describe, expect, it } from "vitest";
import { addDaysIso, formatDate, formatDateTimeIst, todayIst } from "@/lib/format/dates";

describe("todayIst", () => {
  it("is already tomorrow in India when UTC is late evening", () => {
    expect(todayIst(new Date("2026-11-02T20:00:00Z"))).toBe("2026-11-03"); // 01:30 IST
  });
  it("matches UTC date in the morning", () => {
    expect(todayIst(new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02");
  });
  it("switches exactly at 18:30 UTC", () => {
    expect(todayIst(new Date("2026-11-02T18:29:59Z"))).toBe("2026-11-02");
    expect(todayIst(new Date("2026-11-02T18:30:00Z"))).toBe("2026-11-03");
  });
});

describe("addDaysIso", () => {
  it("crosses month and year ends", () => {
    expect(addDaysIso("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("formatDate", () => {
  it("renders day, short month, year", () => {
    expect(formatDate("2026-11-03")).toBe("3 Nov 2026");
  });
});

describe("formatDateTimeIst", () => {
  it("shows India date and time", () => {
    expect(formatDateTimeIst("2026-11-03T10:35:00Z")).toBe("3 Nov 2026, 4:05 pm");
  });
  it("rolls to the next India day late in the UTC evening", () => {
    expect(formatDateTimeIst("2026-11-03T20:00:00Z")).toBe("4 Nov 2026, 1:30 am");
  });
});
