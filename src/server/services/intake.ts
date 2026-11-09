import { type SessionUser } from "@/lib/auth";
import { todayIst } from "@/lib/format/dates";
import { ExtractionError, createFromIntakeSchema, extractSchema, verifyExtraction, type Extraction, type ExtractionProvider, type ProviderInfo } from "@/lib/intake";
import * as intakeRepo from "@/server/repositories/intake";
import { listAllRates } from "@/server/repositories/rates";
import { getExtractionProvider } from "@/server/intake/provider";
import { fail, guarded } from "./costing";

export interface ExtractResult { provider: ProviderInfo; extraction: Extraction; warnings: string[] }

/** Proposes values from an email. Saves nothing. */
export function extractFromEmail(user: SessionUser | null, raw: unknown, provider: ExtractionProvider = getExtractionProvider(), today = todayIst()) {
  return guarded<ExtractResult>(user, "rfq:create", async () => {
    const parsed = extractSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Paste the RFQ email first.");
    const rates = await listAllRates();
    const ctx = { today, knownMaterials: [...new Set(rates.materials.map((m) => m.materialCode))] };
    try {
      const proposed = await provider.extract(parsed.data.email, ctx);
      const { extraction, warnings } = verifyExtraction(parsed.data.email, proposed, ctx);
      return { ok: true, provider: provider.info, extraction, warnings };
    } catch (error) {
      if (error instanceof ExtractionError) return fail(error.message);
      throw error;
    }
  });
}

export function createRfqFromIntake(user: SessionUser | null, raw: unknown, today = todayIst()) {
  return guarded<{ rfqId: string; partId: string; rfqNo: string }>(user, "rfq:create", async (u) => {
    const parsed = createFromIntakeSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Some values are not valid", String(parsed.error.issues[0]?.path.join(".") ?? ""));
    const { part, dueDate } = parsed.data;
    if (new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate) return fail("The due date does not exist.", "dueDate");
    if (part.grossWeightKg && part.netWeightKg && Number(part.netWeightKg) > Number(part.grossWeightKg)) return fail("Net weight cannot exceed gross weight.", "part.netWeightKg");
    const created = await intakeRepo.createRfqWithPart(parsed.data, u.id, today);
    return { ok: true, ...created };
  });
}
