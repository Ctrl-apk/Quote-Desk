import { beforeEach, describe, expect, it, vi } from "vitest";
import { pastQuotesCsv } from "../../prisma/seed-data";
import type { SessionUser } from "@/lib/auth";

const repo = vi.hoisted(() => ({ existingKeys: vi.fn(), insertPastQuotes: vi.fn() }));
vi.mock("@/server/repositories/past-quotes", () => repo);
vi.mock("@/server/repositories/parts", () => ({}));
vi.mock("@/server/repositories/quotes", () => ({}));
vi.mock("@/server/repositories/rates", () => ({}));
const service = await import("@/server/services/past-quotes");

const estimator: SessionUser = { id: "e", email: "e@x.test", name: "E", role: "estimator" };
const salesHead: SessionUser = { id: "s", email: "s@x.test", name: "S", role: "sales_head" };
const csv = (text = pastQuotesCsv(), name = "past.csv") => new File([text], name, { type: "text/csv" });

beforeEach(() => { vi.clearAllMocks(); repo.existingKeys.mockResolvedValue(new Set()); repo.insertPastQuotes.mockImplementation(async (rows: unknown[]) => rows.length); });

describe("previewImport", () => {
  it("is for estimators; the sales head cannot run imports", async () => {
    expect((await service.previewImport(salesHead, csv())).ok).toBe(false);
    expect((await service.previewImport(null, csv())).ok).toBe(false);
  });
  it("reports counts and problems without writing", async () => {
    const res = await service.previewImport(estimator, csv());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.preview).toMatchObject({ newRows: 30, alreadyPresent: 0, totalRows: 35 });
      expect(res.preview.problems).toHaveLength(5);
    }
    expect(repo.insertPastQuotes).not.toHaveBeenCalled();
  });
  it("says what is already there on a re-upload", async () => {
    repo.existingKeys.mockImplementation(async (keys: string[]) => new Set(keys));
    const res = await service.previewImport(estimator, csv());
    if (res.ok) expect(res.preview).toMatchObject({ newRows: 0, alreadyPresent: 30 });
  });
  it("rejects wrong file types, empty files, oversize files and missing columns", async () => {
    expect((await service.previewImport(estimator, csv("x", "notes.txt"))).ok).toBe(false);
    expect((await service.previewImport(estimator, csv("", "a.csv"))).ok).toBe(false);
    expect((await service.previewImport(estimator, csv("a,b\n1,2", "a.csv"))).ok).toBe(false);
    expect((await service.previewImport(estimator, new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.csv"))).ok).toBe(false);
    expect((await service.previewImport(estimator, "not a file")).ok).toBe(false);
  });
});

describe("commitImport", () => {
  it("inserts only the new good rows", async () => {
    const res = await service.commitImport(estimator, csv());
    expect(res).toEqual({ ok: true, inserted: 30, skippedExisting: 0, problems: 5 });
    expect(repo.insertPastQuotes.mock.calls[0]![0]).toHaveLength(30);
  });
  it("a repeat upload inserts nothing", async () => {
    repo.existingKeys.mockImplementation(async (keys: string[]) => new Set(keys));
    expect(await service.commitImport(estimator, csv())).toEqual({ ok: true, inserted: 0, skippedExisting: 30, problems: 5 });
    expect(repo.insertPastQuotes).not.toHaveBeenCalled();
  });
  it("the sales head cannot commit", async () => {
    expect((await service.commitImport(salesHead, csv())).ok).toBe(false);
    expect(repo.insertPastQuotes).not.toHaveBeenCalled();
  });
});
