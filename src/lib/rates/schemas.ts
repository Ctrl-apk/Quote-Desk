import { z } from "zod";
import { addDaysIso } from "@/lib/format/dates";
import type { IsoDate } from "./types";

/** How far from today a rate may start (assumption R-08): a year back or ahead catches typos like 2062. */
export const RATE_DATE_WINDOW_DAYS = 366;

const money = (label: string) =>
  z.string().trim().regex(/^\d{1,8}(\.\d{1,4})?$/, { error: `${label}: enter a number` });
const code = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,29}$/, { error: "Use letters, numbers and - . _ / (up to 30)" });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use YYYY-MM-DD" });

export const addRateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("material"),
    code,
    effectiveFrom: isoDate,
    ratePerKg: money("Rate per kg"),
    scrapRecoveryPerKg: money("Scrap recovery per kg"),
  }),
  z.object({
    kind: z.literal("machine"),
    code,
    effectiveFrom: isoDate,
    hourRate: money("Hour rate"),
    efficiency: money("Efficiency"),
  }),
  z.object({
    kind: z.literal("overhead"),
    code,
    effectiveFrom: isoDate,
    percent: money("Overhead percent"),
  }),
]);
export type AddRateInput = z.infer<typeof addRateSchema>;

/** Business checks beyond shape. Returns a message, or null when the rate is acceptable. */
export function checkRateRules(input: AddRateInput, today: IsoDate): string | null {
  const oldest = addDaysIso(today, -RATE_DATE_WINDOW_DAYS);
  const newest = addDaysIso(today, RATE_DATE_WINDOW_DAYS);
  if (new Date(`${input.effectiveFrom}T00:00:00Z`).toISOString().slice(0, 10) !== input.effectiveFrom) return "That date does not exist.";
  if (input.effectiveFrom < oldest || input.effectiveFrom > newest) return "The effective date must be within a year of today.";
  if (input.kind === "material") {
    if (Number(input.ratePerKg) <= 0) return "Rate per kg must be above zero.";
    if (Number(input.scrapRecoveryPerKg) > Number(input.ratePerKg)) return "Scrap recovery cannot exceed the material rate.";
  }
  if (input.kind === "machine") {
    if (Number(input.hourRate) <= 0) return "Hour rate must be above zero.";
    if (Number(input.efficiency) <= 0 || Number(input.efficiency) > 1) return "Efficiency must be above 0 and at most 1 (for example 0.85).";
  }
  if (input.kind === "overhead" && Number(input.percent) > 100) return "Overhead cannot exceed 100%.";
  return null;
}
