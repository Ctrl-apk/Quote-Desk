import { MAX_SCRAP_PERCENT } from "./limits";
import { CostInputError } from "./errors";
import { D, type Dec, type NumericInput, nonNegative, percent, positive, roundPaise } from "./money";

export interface MaterialInput {
  grossWeightKg: NumericInput;
  netWeightKg: NumericInput;
  ratePerKg: NumericInput;
  scrapRecoveryPerKg: NumericInput;
  /** Extra material bought as an allowance, as % of gross weight (3 means 3%). Blank means 0. */
  scrapPercent?: NumericInput;
}

/**
 * F-01 with the scrap allowance (F-10):
 *   gross × (1 + scrap %) × rate  −  (gross − net) × scrap recovery rate
 * The allowance adds bought kilograms; the recovery credit stays on (gross − net) only,
 * so the allowance is not credited back. Rejects missing, zero or negative inputs, a recovery rate above the material rate (so material cost can never go negative),
 * scrap % outside 0 to 50 (F-23), and net weight above gross.
 */
export function materialCostPerUnit(input: MaterialInput): Dec {
  const gross = positive("grossWeightKg", input.grossWeightKg);
  const net = positive("netWeightKg", input.netWeightKg);
  const rate = positive("ratePerKg", input.ratePerKg);
  const recovery = nonNegative("scrapRecoveryPerKg", input.scrapRecoveryPerKg);
  const blankScrap = input.scrapPercent === null || input.scrapPercent === undefined || input.scrapPercent === "";
  const allowance = percent("scrapPercent", blankScrap ? 0 : input.scrapPercent, MAX_SCRAP_PERCENT);

  if (net.gt(gross)) {
    throw new CostInputError("NET_EXCEEDS_GROSS", "netWeightKg", "Net weight cannot exceed gross weight");
  }

  // A recovery rate above the buying rate would let scrap credit exceed what was paid (defect found in review).
  if (recovery.gt(rate)) {
    throw new CostInputError("RECOVERY_EXCEEDS_RATE", "scrapRecoveryPerKg", "Scrap recovery per kg cannot exceed the material rate per kg");
  }
  const boughtKg = gross.times(new D(1).plus(allowance.div(100)));
  const exact = boughtKg.times(rate).minus(gross.minus(net).times(recovery));
  // Unreachable when the checks above hold (exact >= net x rate > 0); kept as a last line of defence.
  if (exact.lte(0)) throw new CostInputError("NEGATIVE_COST", "material", "Material cost must be above zero");
  return roundPaise(exact);
}
