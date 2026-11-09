import { MAX_OVERHEAD_PERCENT, MAX_MARKUP_PERCENT, MAX_GST_PERCENT } from "./limits";
import { requiresApproval } from "./approval";
import { conversionCostPerUnit, type OperationInput } from "./conversion";
import { materialCostPerUnit, type MaterialInput } from "./material";
import { D, type Dec, type NumericInput, nonNegative, percent, positiveInteger, roundHalfUp, roundPaise } from "./money";

/** F-09: tiers are 0.5×, 1× and 1.5× of annual volume. The 1× tier (index 1) drives approval. */
export const VOLUME_TIER_FACTORS = ["0.5", "1", "1.5"] as const;
export const BASE_TIER_INDEX = 1;

/** F-07: default GST rate, in percent. Pass `gstPercent` to override. */
export const DEFAULT_GST_PERCENT = "18";

type PerTier<T> = readonly [T, T, T];

export interface QuoteCostInput {
  annualVolume: NumericInput;
  material: MaterialInput;
  routing: readonly OperationInput[];
  /** One-off setup and tooling in rupees, amortised over each tier's volume (F-03). */
  setupCost: NumericInput;
  toolingCost: NumericInput;
  /** Percent of conversion cost (F-05). */
  overheadPercent: NumericInput;
  packingPerUnit: NumericInput;
  /** Per-unit freight for the 0.5×, 1× and 1.5× tiers (F-04). */
  freightPerUnit: PerTier<NumericInput>;
  /** Markup on total cost, in percent. Not gross margin: price = cost × (1 + markup) (F-06). */
  markupPercent: NumericInput;
  gstPercent?: NumericInput;
}

/** All money fields are per unit, in rupees, rounded to paise. GST is never inside pricePerUnit. */
export interface TierResult {
  factor: string;
  /** Pieces in this tier: half-up rounded, at least 1. */
  volume: Dec;
  material: Dec;
  conversion: Dec;
  setupTooling: Dec;
  overhead: Dec;
  packing: Dec;
  freight: Dec;
  totalCost: Dec;
  markup: Dec;
  pricePerUnit: Dec;
  gst: Dec;
  /** pricePerUnit × volume, excluding GST (F-13). */
  annualValue: Dec;
}

export interface QuoteCost {
  tiers: PerTier<TierResult>;
  /** Pre-GST annual value of the 1× tier, the figure approval is judged on (A-01, A-02). */
  baseAnnualValue: Dec;
  requiresApproval: boolean;
}

/** Tier volume: annual volume × factor, half-up to whole pieces, never below 1. */
export function tierVolume(annualVolume: Dec, factor: string): Dec {
  const pieces = roundHalfUp(annualVolume.times(factor), 0);
  return pieces.lt(1) ? new D(1) : pieces;
}

/**
 * Prices a part at all three volume tiers. Pure and deterministic; never uses AI.
 * Material, conversion, overhead and packing do not vary by tier; setup + tooling
 * amortisation and freight do. Every component is rounded to paise once, and totals
 * are sums of those rounded components, so the printed rows always add up.
 */
export function calculateQuoteCost(input: QuoteCostInput): QuoteCost {
  const annualVolume = positiveInteger("annualVolume", input.annualVolume);
  const oneOffCosts = nonNegative("setupCost", input.setupCost).plus(nonNegative("toolingCost", input.toolingCost));
  const overheadPercent = percent("overheadPercent", input.overheadPercent, MAX_OVERHEAD_PERCENT);
  const markupPercent = percent("markupPercent", input.markupPercent, MAX_MARKUP_PERCENT);
  const gstPercent = percent("gstPercent", input.gstPercent ?? DEFAULT_GST_PERCENT, MAX_GST_PERCENT);
  const packing = roundPaise(nonNegative("packingPerUnit", input.packingPerUnit));
  const freights = input.freightPerUnit.map((value, i) => roundPaise(nonNegative(`freightPerUnit[${i}]`, value)));

  const material = materialCostPerUnit(input.material);
  const conversion = conversionCostPerUnit(input.routing);
  const overhead = roundPaise(conversion.times(overheadPercent).div(100));

  const tiers = VOLUME_TIER_FACTORS.map((factor, i): TierResult => {
    const volume = tierVolume(annualVolume, factor);
    const setupTooling = roundPaise(oneOffCosts.div(volume));
    const freight = freights[i] as Dec;
    const totalCost = material.plus(conversion).plus(setupTooling).plus(overhead).plus(packing).plus(freight);
    const markup = roundPaise(totalCost.times(markupPercent).div(100));
    const pricePerUnit = totalCost.plus(markup);
    return {
      factor,
      volume,
      material,
      conversion,
      setupTooling,
      overhead,
      packing,
      freight,
      totalCost,
      markup,
      pricePerUnit,
      gst: roundPaise(pricePerUnit.times(gstPercent).div(100)),
      annualValue: pricePerUnit.times(volume),
    };
  }) as unknown as PerTier<TierResult>;

  const baseAnnualValue = tiers[BASE_TIER_INDEX].annualValue;
  return { tiers, baseAnnualValue, requiresApproval: requiresApproval(baseAnnualValue) };
}
