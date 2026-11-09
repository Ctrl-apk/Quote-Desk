export type CostInputErrorCode = "MISSING" | "NOT_A_NUMBER" | "NOT_POSITIVE" | "NEGATIVE" | "NET_EXCEEDS_GROSS" | "EMPTY_ROUTING" | "EFFICIENCY_RANGE" | "NOT_INTEGER" | "PERCENT_RANGE" | "RECOVERY_EXCEEDS_RATE" | "NEGATIVE_COST";

/** Thrown when a costing input is missing or invalid. `field` names the offending input for the UI. */
export class CostInputError extends Error {
  constructor(
    public readonly code: CostInputErrorCode,
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "CostInputError";
  }
}
