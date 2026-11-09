import Decimal from "decimal.js";
import { CostInputError } from "./errors";

/**
 * Decimal constructor used for every money and quantity calculation.
 * Half-up rounding, 28 significant digits; floats never touch money (assumption M-01).
 */
export const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;
export type NumericInput = string | number | Dec | null | undefined;

/** Parses an input into a Decimal or throws a CostInputError naming the field. */
export function toDecimal(field: string, value: NumericInput): Dec {
  if (value === null || value === undefined || value === "") {
    throw new CostInputError("MISSING", field, `${field} is required`);
  }
  let parsed: Dec;
  try {
    parsed = new D(value);
  } catch {
    throw new CostInputError("NOT_A_NUMBER", field, `${field} is not a number`);
  }
  if (!parsed.isFinite()) {
    throw new CostInputError("NOT_A_NUMBER", field, `${field} is not a finite number`);
  }
  return parsed;
}

export function positive(field: string, value: NumericInput): Dec {
  const parsed = toDecimal(field, value);
  if (parsed.lte(0)) throw new CostInputError("NOT_POSITIVE", field, `${field} must be greater than zero`);
  return parsed;
}

export function nonNegative(field: string, value: NumericInput): Dec {
  const parsed = toDecimal(field, value);
  if (parsed.isNegative()) throw new CostInputError("NEGATIVE", field, `${field} cannot be negative`);
  return parsed;
}

/**
 * The one rounding point for money: a cost component per unit is rounded to paise once,
 * half-up, and totals are sums of already-rounded components (assumption M-02).
 */
export function roundPaise(value: Dec): Dec {
  return roundHalfUp(value, 2);
}

export function roundHalfUp(value: Dec, places: number): Dec {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
}

/** A whole number of at least one, e.g. annual volume in pieces. */
export function positiveInteger(field: string, value: NumericInput): Dec {
  const parsed = positive(field, value);
  if (!parsed.isInteger()) throw new CostInputError("NOT_INTEGER", field, `${field} must be a whole number`);
  return parsed;
}

/** A percentage entered as a number (12 means 12%). Zero is allowed; `max` defaults to no upper bound. */
export function percent(field: string, value: NumericInput, max?: number): Dec {
  const parsed = nonNegative(field, value);
  if (max !== undefined && parsed.gt(max)) {
    throw new CostInputError("PERCENT_RANGE", field, `${field} cannot be more than ${max}%`);
  }
  return parsed;
}
