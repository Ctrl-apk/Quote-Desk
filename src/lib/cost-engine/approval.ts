import { D, type NumericInput, nonNegative } from "./money";

/** Annual value above this needs sales_head approval (assumption A-01). Rupees, excluding GST. */
export const APPROVAL_THRESHOLD_INR = "2500000";

/** A-02: strictly above the threshold needs approval; exactly the threshold does not. */
export function requiresApproval(annualValue: NumericInput, threshold: NumericInput = APPROVAL_THRESHOLD_INR): boolean {
  return nonNegative("annualValue", annualValue).gt(new D(threshold as string | number));
}
