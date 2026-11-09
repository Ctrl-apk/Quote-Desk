import { type SessionUser } from "@/lib/auth";
import { todayIst } from "@/lib/format/dates";
import { addPartSchema, createRfqSchema, MAX_PARTS_PER_RFQ, removePartSchema, renamePartSchema, updateRfqSchema } from "@/lib/rfq/manage";
import { parsePartList, type PartListReport } from "@/lib/intake/part-list";
import { ImportFileError, readTable } from "@/server/import/read-file";
import * as repo from "@/server/repositories/rfq-manage";
import { listAllRates } from "@/server/repositories/rates";
import { fail, guarded } from "./costing";

function firstIssue(error: { issues: { message: string; path: PropertyKey[] }[] }) {
  const i = error.issues[0];
  return fail(i?.message ?? "Some values are not valid", i ? i.path.filter((p) => typeof p !== "symbol").join(".") : undefined);
}

export function createRfq(user: SessionUser | null, raw: unknown, today = todayIst()) {
  return guarded<{ rfqId: string; rfqNo: string; partIds: string[] }>(user, "rfq:create", async (u) => {
    const parsed = createRfqSchema.safeParse(raw);
    if (!parsed.success) return firstIssue(parsed.error);
    return { ok: true, ...(await repo.createRfqManual(parsed.data, u.id, today, parsed.data.source ?? "manual")) };
  });
}

export function updateRfq(user: SessionUser | null, raw: unknown) {
  return guarded<{ done?: true }>(user, "rfq:update", async (u) => {
    const parsed = updateRfqSchema.safeParse(raw);
    if (!parsed.success) return firstIssue(parsed.error);
    const done = await repo.updateRfq(parsed.data, u.id);
    return done.ok ? { ok: true } : fail(done.message);
  });
}

export function addPart(user: SessionUser | null, raw: unknown) {
  return guarded<{ partId: string }>(user, "rfq:update", async (u) => {
    const parsed = addPartSchema.safeParse(raw);
    if (!parsed.success) return firstIssue(parsed.error);
    const done = await repo.addPart(parsed.data.rfqId, parsed.data.part, u.id, MAX_PARTS_PER_RFQ);
    return done.ok ? { ok: true, partId: done.partId } : fail(done.message);
  });
}

export function renamePart(user: SessionUser | null, raw: unknown) {
  return guarded<{ done?: true }>(user, "rfq:update", async (u) => {
    const parsed = renamePartSchema.safeParse(raw);
    if (!parsed.success) return firstIssue(parsed.error);
    const done = await repo.renamePart(parsed.data.partId, parsed.data.name, u.id);
    return done.ok ? { ok: true } : fail(done.message);
  });
}

export function removePart(user: SessionUser | null, raw: unknown) {
  return guarded<{ done?: true }>(user, "rfq:update", async (u) => {
    const parsed = removePartSchema.safeParse(raw);
    if (!parsed.success) return firstIssue(parsed.error);
    const done = await repo.removePart(parsed.data.partId, u.id);
    return done.ok ? { ok: true } : fail(done.message);
  });
}

/** Reads a customer's part list (.csv or .xlsx) and reports what it holds. Writes nothing; the estimator reviews the parts before creating the RFQ. */
export function readPartList(user: SessionUser | null, file: unknown) {
  return guarded<{ report: PartListReport }>(user, "rfq:create", async () => {
    try {
      if (!(file instanceof File)) throw new ImportFileError("Choose a file to upload.");
      const table = await readTable(file);
      const rates = await listAllRates();
      const report = parsePartList(table, [...new Set(rates.materials.map((m) => m.materialCode))]);
      if (report.fatal) return fail(report.fatal);
      return { ok: true, report };
    } catch (error) {
      if (error instanceof ImportFileError) return fail(error.message);
      throw error;
    }
  });
}
