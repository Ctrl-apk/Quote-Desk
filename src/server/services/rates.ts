import { AuthError, authorize, type SessionUser } from "@/lib/auth";
import { todayIst } from "@/lib/format/dates";
import { RateDateExistsError, addRateSchema, assertRateDateFree, checkRateRules } from "@/lib/rates";
import * as rateRepo from "@/server/repositories/rates";
import type { ServiceResult } from "./costing";

const fail = (error: string, field?: string): { ok: false; error: string; field?: string } => ({ ok: false, error, field });

/**
 * Adds a new dated rate version. Only the sales head may (assumption A-04).
 * Existing rows are never touched: a "change" is always a new row with a later date.
 */
export async function addRateVersion(user: SessionUser | null, raw: unknown, today = todayIst()): Promise<ServiceResult> {
  try {
    authorize(user, "rates:add");
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message);
    throw error;
  }
  const parsed = addRateSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Some values are not valid", String(parsed.error.issues[0]?.path[0] ?? ""));
  const rule = checkRateRules(parsed.data, today);
  if (rule) return fail(rule);

  const rates = await rateRepo.listAllRates();
  const rows = parsed.data.kind === "material" ? rates.materials.filter((r) => r.materialCode === parsed.data.code)
    : parsed.data.kind === "machine" ? rates.machines.filter((r) => r.machineCode === parsed.data.code)
    : rates.overhead.filter((r) => r.category === parsed.data.code);
  try {
    assertRateDateFree(parsed.data.kind, parsed.data.code, parsed.data.effectiveFrom, rows.map((r) => r.effectiveFrom));
    await rateRepo.addRate(parsed.data, user!.id);
  } catch (error) {
    if (error instanceof RateDateExistsError) return fail(error.message, "effectiveFrom");
    if (error instanceof rateRepo.RateExistsError) return fail("A rate for that code and date already exists. Choose a later date.", "effectiveFrom");
    throw error;
  }
  return { ok: true };
}
