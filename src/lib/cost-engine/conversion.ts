import { CostInputError } from "./errors";
import { D, type Dec, type NumericInput, positive, roundPaise } from "./money";

export interface OperationInput {
  cycleTimeMin: NumericInput;
  hourRate: NumericInput;
  /** 0 < efficiency <= 1. Held on the machine rate (assumption F-11). */
  efficiency: NumericInput;
}

/** Cost of one operation per piece, unrounded: cycle min ÷ 60 × hour rate ÷ efficiency. */
export function operationCostPerPiece(op: OperationInput, index: number): Dec {
  const label = `routing[${index}]`;
  const cycle = positive(`${label}.cycleTimeMin`, op.cycleTimeMin);
  const rate = positive(`${label}.hourRate`, op.hourRate);
  const efficiency = positive(`${label}.efficiency`, op.efficiency);
  if (efficiency.gt(1)) {
    throw new CostInputError("EFFICIENCY_RANGE", `${label}.efficiency`, "Efficiency must be above 0 and at most 1");
  }
  return cycle.div(60).times(rate).div(efficiency);
}

/**
 * F-02: sum over operations of (cycle min ÷ 60 × hour rate ÷ efficiency).
 * Operations are summed unrounded, then rounded to paise once.
 */
export function conversionCostPerUnit(operations: readonly OperationInput[]): Dec {
  if (operations.length === 0) {
    throw new CostInputError("EMPTY_ROUTING", "routing", "Add at least one routing operation");
  }
  const total = operations.reduce((sum, op, i) => sum.plus(operationCostPerPiece(op, i)), new D(0));
  return roundPaise(total);
}
