import { type SessionUser } from "@/lib/auth";
import { suggestRoutingSchema } from "@/lib/costing/schemas";
import type { RoutingSuggestion } from "@/lib/costing/routing-suggestion";
import { validatePastQuoteRows, type ImportReport } from "@/lib/import/past-quotes";
import { ImportFileError, readTable } from "@/server/import/read-file";
import * as repo from "@/server/repositories/past-quotes";
import { fail, guarded } from "./costing";

export interface ImportPreview {
  fileName: string;
  totalRows: number;
  newRows: number;
  alreadyPresent: number;
  repeatedInFile: number;
  problems: ImportReport["problems"];
  sample: { customer: string; partName: string; materialCode: string; pricePerUnit: string }[];
}

async function analyse(file: unknown) {
  if (!(file instanceof File)) throw new ImportFileError("Choose a file to upload.");
  const report = validatePastQuoteRows(await readTable(file));
  if (report.fatal) throw new ImportFileError(report.fatal);
  const existing = await repo.existingKeys(report.rows.map((r) => r.importKey));
  return { file, report, existing };
}

/** Checks a file and reports what an import would do. Writes nothing. */
export function previewImport(user: SessionUser | null, file: unknown) {
  return guarded<{ preview: ImportPreview }>(user, "import:run", async () => {
    try {
      const { file: f, report, existing } = await analyse(file);
      const alreadyPresent = report.rows.filter((r) => existing.has(r.importKey)).length;
      return {
        ok: true,
        preview: {
          fileName: f.name, totalRows: report.rows.length + report.problems.length + report.repeatedInFile,
          newRows: report.rows.length - alreadyPresent, alreadyPresent, repeatedInFile: report.repeatedInFile, problems: report.problems,
          sample: report.rows.slice(0, 5).map((r) => ({ customer: r.customer, partName: r.partName, materialCode: r.materialCode, pricePerUnit: r.pricePerUnit })),
        },
      };
    } catch (error) {
      if (error instanceof ImportFileError) return fail(error.message);
      throw error;
    }
  });
}

/** Imports the good rows. Bad rows are skipped and reported; rows already present are left alone. */
export function commitImport(user: SessionUser | null, file: unknown) {
  return guarded<{ inserted: number; skippedExisting: number; problems: number }>(user, "import:run", async (u) => {
    try {
      const { report, existing } = await analyse(file);
      const fresh = report.rows.filter((r) => !existing.has(r.importKey));
      const inserted = fresh.length ? await repo.insertPastQuotes(fresh, u.id) : 0;
      return { ok: true, inserted, skippedExisting: report.rows.length - fresh.length, problems: report.problems.length };
    } catch (error) {
      if (error instanceof ImportFileError) return fail(error.message);
      throw error;
    }
  });
}

/** The closest similar past quote's routing, as a suggestion. Reads only; nothing is applied or stored. */
export function suggestRouting(user: SessionUser | null, raw: unknown) {
  return guarded<{ suggestion: RoutingSuggestion | null }>(user, "rfq:view", async () => {
    const parsed = suggestRoutingSchema.safeParse(raw);
    if (!parsed.success) return fail("Enter a material and a gross weight first.");
    const { rows } = await repo.searchPastQuotes({ q: "", material: parsed.data.materialCode, weight: parsed.data.grossWeightKg, from: null, to: null });
    const best = rows[0];
    if (!best) return { ok: true, suggestion: null };
    return {
      ok: true,
      suggestion: {
        reference: { partName: best.partName, partNumber: best.partNumber, customer: best.customer, quoteRef: best.quoteRef, quotedOn: best.quotedOn, materialCode: best.materialCode, grossWeightKg: best.grossWeightKg },
        steps: best.routing,
      },
    };
  });
}
